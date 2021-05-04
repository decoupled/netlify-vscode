import { LazyGetter as lazy } from "lazy-get-decorator"
import { values } from "lodash"
import { Memoize as memo } from "lodash-decorators"
import { basename, join } from "path"
import vscode from "vscode"
import { iter } from "../../Iterable/iter"
import { vscode_Uri_smartParse } from "../../vscode/vscode_Uri_smartParse"
import { NetlifyAPIWrapper } from "../api/netlify_api"
import { netlify_vsc_oauth_manager } from "./netlify_vsc_oauth_manager"
import { NetlifyStateDotJSON } from "../NetlifyStateDotJSON"

const commands = {
  deploy: {
    command: "decoupled.netlify.deploy",
    title: "Deploy to Netlify...",
    category: "Netlify",
  },
}

/**
 * This command is everywhere
 */
export function netlify_vsc_command_deploy_activate(
  ctx: vscode.ExtensionContext
) {
  vscode.commands.registerCommand(
    commands.deploy.command,
    async (...args: any[]) => {
      let [uri] = args
      if (typeof uri === "string") uri = vscode_Uri_smartParse(uri)
      if (!(uri instanceof vscode.Uri)) uri = undefined
      const cc = new DeployToNetlifyCommandBuilder({ uri, ctx })
      await cc.start()
    }
  )
}

interface Opts {
  uri?: vscode.Uri
  ctx: vscode.ExtensionContext
}

class DeployToNetlifyCommandBuilder {
  constructor(private opts: Opts) {}
  @memo() async start() {
    // logged in?
    const mgr = netlify_vsc_oauth_manager(this.opts.ctx)
    if (!mgr.token) {
      const res = await (
        await vscode.window.showQuickPick(
          [
            {
              label:
                "Login (or Sign Up) to Netlify (recommended). This will open a new window.",
              picked: true,
              next: () => mgr.login(),
            },
            {
              label: "I have a Personal Access Token",
              next: () =>
                vscode.window.showInformationMessage(
                  "TODO: PAT not implemented yet"
                ),
            },
          ],
          { placeHolder: "Let's connect to your Nelify Account" }
        )
      )?.next?.()
      if (typeof res !== "string") return
    }
    const uri = await new PickDeployFolder(this.opts).start()
    if (!uri) return
    return await new DeployExistingFolder({ uri, ctx: this.opts.ctx }).start()
  }
}

class DeployExistingFolder {
  constructor(private opts: Opts & { uri: vscode.Uri }) {}

  @memo() async start() {
    const site = await this.site()
    if (!site) return
    const qp = this.quickPick
    qp.step = 4
    qp.placeholder = "pick something else..."
    qp.items = []
  }
  @lazy() get basename() {
    // TODO: show more path parts
    return this.opts.uri.path.split("/").pop()
  }
  @lazy() get quickPick() {
    const qp = vscode.window.createQuickPick()
    qp.title = `deploy "${this.basename}" to netlify`
    qp.show()
    qp.step = 1
    qp.totalSteps = 4
    return qp
  }
  @memo() async api() {
    this.quickPick.step = 1
    this.quickPick.busy = true
    const token = await netlify_vsc_oauth_manager(
      this.opts.ctx
    ).get_token_login_if_needed()
    this.quickPick.busy = false
    if (!token) {
      vscode.window.showErrorMessage("could not login to netlify")
      return
    }
    return new NetlifyAPIWrapper(token)
  }
  getSiteIdFromStateJSON() {
    const { uri } = this.opts
  }
  @memo() async site() {
    // check if site is already linked via .netlify/state.json > siteId
    const siteId = NetlifyStateDotJSON.forDir(this.opts.uri.fsPath).siteId
    if (siteId) {
      // do something here
    }
    this.quickPick.step = 2
    const api = await this.api()
    if (!api) return
    this.quickPick.busy = true
    const sites = await api.sites()
    this.quickPick.busy = false
    const site_items = sites.map((site) => {
      return {
        label: "$(globe) " + site.quickPickItem_label,
        site,
      }
    })
    const xx = { label: "$(add) create new site...", site: undefined }
    const qp = this.quickPick
    const items = [xx, ...site_items]
    qp.items = items
    qp.placeholder = "pick a site"
    const item = await QuickPick_waitForSelection(qp)
    if (!item) return
    if (typeof (item as any).site === "undefined") {
      vscode.window.showInformationMessage(
        "creating new sites not implemented..."
      )
      return
    } else {
      const site = (item as any).site
      console.log("publish to site with id = ", site.id)
      return site
    }
  }
}

export function ___buildmeta___() {
  return {
    pjson: {
      contributes: {
        commands: [...values(commands)],
        menus: {
          "explorer/context": [
            {
              command: commands.deploy.command,
              group: "7_modification",
              when: "explorerResourceIsFolder",
            },
          ],
        },
      },
    },
  }
}

function QuickPick_waitForSelection<T extends vscode.QuickPickItem>(
  qp: vscode.QuickPick<T>
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    qp.onDidAccept((e) => resolve(qp.selectedItems[0]))
    qp.onDidHide((e) => resolve(undefined))
  })
}

class PickDeployFolder {
  constructor(public opts: { uri?: vscode.Uri }) {}
  @memo() async start(): Promise<vscode.Uri | undefined> {
    return await this.uri()
  }
  private async uri() {
    const { uri } = this.opts
    const wfs = vscode.workspace.workspaceFolders ?? []
    if (uri instanceof vscode.Uri) {
      const wf = vscode.workspace.getWorkspaceFolder(uri)
      if (!wf) return uri
      if (wf.uri.toString() === uri.toString()) return uri
      // if uri isn't a top-level (workspace folder)
      // this is probably a mistake (user right-clicked on a folder "inside" the project)
      return (
        await vscode.window.showQuickPick(
          [
            {
              label: `Deploy folder "${basename(uri.fsPath)}"`,
              picked: true,
              _value: uri,
            },
            {
              label: `Deploy containing workspace folder "${wf.name}"`,
              _value: wf.uri,
            },
          ],
          {
            placeHolder:
              "Warning: Do you want to deploy the selected folder or the containing workspace folder?",
          }
        )
      )?._value
    }
    if (wfs.length === 0) {
      // no workspaces, open file picker
      return await this.openFilePicker()
    }
    // pick from open workspace folders
    const wfsi = iter(function* () {
      for (const wf of wfs)
        yield {
          label: wf.name,
          _wf: wf,
          description: basename(wf.uri.fsPath),
        }
    })
    const pickCustom = { label: "Choose different folder...", _wf: undefined }
    const items = [...wfsi, pickCustom]
    let result = await vscode.window.showQuickPick(items, {
      placeHolder: "Choose folder/workspace to deploy",
    })
    if (Array.isArray(result)) result = result[0]
    if (typeof result === "undefined") return undefined
    if (result === pickCustom) return this.openFilePicker()
    return result._wf?.uri
  }
  private async openFilePicker(
    defaultUri?: vscode.Uri
  ): Promise<vscode.Uri | undefined> {
    const res = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri,
      openLabel: "Select",
      title: "Choose folder to deploy",
    })
    return res?.[0]
  }
}
