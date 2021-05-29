import execa from "execa"
import { values } from "lodash"
import { memo } from "src/x/decorators"
import { netlify_events_meta } from "src/x/netlify/events/netlify_events_meta"
import { vscode_QuickPick_await } from "src/x/vscode/vscode_QuickPick_await"
import { vscode_window_createTerminal_andRun } from "src/x/vscode/vscode_window_createTerminal_andRun"
import vscode from "vscode"
import { miniserver_port } from "../miniserver"

export function commands_create_function(ctx: vscode.ExtensionContext) {
  vscode.commands.registerCommand(
    commands.create_function.command,
    () => {
      const frb = new CreateFunctionWizard()
      frb.start()
      // Trigger: Command : Netlify > Add a new function
      // Pick a function directory, if not already configured
      // Pick a language (JavaScript, TypeScript, Go)
      // Pick a type (synchronous, background, event)
      // If event, pick a type and configuration
      // If sync or background, pick from a template
      // Provide a name
      // Auto-populate the directory with the template file
    },
    ctx.subscriptions
  )
}

type FunctionType = "sync" | "background" | "event" | "template"

// functions context menu: show log
// https://docs.netlify.com/functions/logs/

// https://docs.netlify.com/functions/overview/
class CreateFunctionWizard {
  constructor() {}
  async start() {
    try {
      const ss = await vscode.window.showQuickPick([
        {
          label: "create new serverless function",
          next: async () => {
            const name = await this.functionName()
            vscode.window.showInformationMessage(`create function ${name}`)
          },
        },
        {
          label: "create from template URL",
          next: async () => {
            const url = breakIfNull(
              await vscode.window.showInputBox({ prompt: "URL" })
            )
            // TOOD: validate
            /*
const validateRepoURL = function (_url) {
  // TODO: use `url.URL()` instead
  // eslint-disable-next-line node/no-deprecated-api
  const URL = url.parse(_url)
  if (URL.host !== 'github.com') return null
  // other validation logic here
  return GITHUB
}
            */
            const name = breakIfNull(await this.functionName())
            await this.runn(`--name=${name} --url=${url}`)
          },
        },
        {
          label: "pick from a list of templates",
          next: async () => {
            const tpl = breakIfNull(await this.pickTemplate()).index
            const name = breakIfNull(await this.functionName())
            await this.runn(`--name=${name} --ide_template=${tpl}`)
          },
        },
      ])
      if (ss) await ss.next()
    } catch (e) {
      if (e !== breakIfNull_Error) throw e
    }
  }

  @memo() async runn(args: string) {
    // we don't use the functionsDir directly
    // but we verify that it exists
    breakIfNull(await this.functionsDir())
    const cmd = `${clipath} functions:create ${args}`
    vscode_window_createTerminal_andRun({
      cmd,
      name: "netlify functions:create",
      cwd: "/Users/aldo/com.github/decoupled/netlify-test-site",
      env: {
        NETLIFY_VSCODE_RPC: miniserver_port(),
      },
    })
  }

  @memo() async getFunctionTemplatesFromCLI() {
    return await cli_functions_create_list_templates()
  }
  private lang?: string
  @memo() async functionLanguage(): Promise<string | undefined> {
    if (this.lang) return this.lang
    return (
      await vscode.window.showQuickPick(
        [
          { label: "JavaScript", value: "js" },
          { label: "TypeScript", value: "ts" },
          { label: "Go", value: "go" },
        ],
        { placeHolder: "Pick Function Language" }
      )
    ).value
  }
  private type?: FunctionType
  @memo() async functionType(): Promise<string | undefined> {
    if (this.type) return this.type
    return (
      await vscode.window.showQuickPick(
        [
          {
            value: "sync",
            label: "$(circuit-board) Serverless Function",
            detail: "Run server-side code",
            // 10 second execution limit for synchronous serverless functions
          },
          {
            value: "background",
            label: "$(clock) Background Function",
            detail: "Execute long-running processes (<15 minutes)",
          },
          {
            value: "event",
            label: "$(zap) Event Handler Function",
            detail:
              "Triggered by events (ex: identity-signup, deploy-succeeded)",
          },
        ],
        {
          placeHolder: "Pick Function Type",
        }
      )
    ).value
  }
  @memo() async eventType(): Promise<string | undefined> {
    return (
      await vscode.window.showQuickPick(eventTypeItems(), {
        placeHolder: "Pick Event Type",
      })
    )?.value
  }
  @memo() async functionName(): Promise<string | undefined> {
    const lang = breakIfNull(await this.functionLanguage())
    let postfix = `.${lang}`
    const functionType = breakIfNull(await this.functionType())
    if (functionType === "event") {
      // event triggers have a fixed name
      return breakIfNull(await this.eventType()) + postfix
    }

    if (functionType === "background") postfix = "-background" + postfix

    const name = await new Promise<string | undefined>((resolve, reject) => {
      // get name
      const ib = vscode.window.createInputBox()
      ib.title = "Pick Function Name"
      let okValue: string | undefined
      ib.onDidChangeValue((v) => {
        ib.validationMessage = ""
        try {
          validateFunctionName(v)
          ib.prompt = v + postfix
          okValue = v + postfix
        } catch (e) {
          okValue = undefined
          ib.validationMessage = e.toString()
        }
      })
      ib.onDidAccept(() => {
        resolve(okValue)
      })
      ib.onDidHide(() => resolve(undefined))
      ib.show()
    })

    return name

    function validateFunctionName(x: string) {
      if (x.length < 3) throw new Error("longer name plz")
    }
  }
  @memo() async functionsDir(): Promise<string> {
    return "/tmp/foo"
  }
  @memo() async pickTemplate() {
    const self = this
    const q = vscode.window.createQuickPick<FuncTemplateItem>()
    q.show()
    q.title = "loading function templates..."
    q.busy = true
    q.items = await getItems()
    q.busy = false
    q.title = "pick a function template"
    const r = await vscode_QuickPick_await(q)
    const ttt = breakIfNull(r)
    this.lang = ttt.data.lang
    this.type = "template"
    return ttt
    async function getItems() {
      return (await self.getFunctionTemplatesFromCLI()).map((x, i) => {
        return {
          label: x.name,
          detail: x.description,
          index: i,
          data: x,
        } as FuncTemplateItem
      })
    }
    interface FuncTemplateItem extends vscode.QuickPickItem {
      index: number
      data: FuncTemplateData
    }
  }
}

const commands = {
  create_function: {
    command: "netlify.create_function",
    title: "Create Function...",
    category: "Netlify",
  },
}

export function commands_create_function_contributes() {
  return {
    contributes: {
      commands: [...values(commands)],
    },
  } as const
}

/*
Add a new function

[P0] Configure netlify.toml 

Trigger: right-click anywhere in the netlify.toml file
Options: 
“Add a redirect” 
“Add a new context” 
“Add a custom header” 
“Add an edge handler” 

Based on the chosen option, populate the template properties into the netlify.toml configuration file in the current workspace. 

*/

const breakIfNull_Error = new Error("break")
function breakIfNull<T>(x: T): NonNullable<T> {
  if (typeof x === "undefined" || x === null) throw breakIfNull_Error
  return x as any
}

export function eventTypeItems() {
  return Object.keys(netlify_events_meta)
    .sort()
    .map((id) => ({
      label: `$(zap) ${id}`,
      value: id,
      detail: netlify_events_meta[id].doc,
    }))
}

const clipath = `/Users/aldo/com.github/decoupled/netlify-cli/bin/run`

async function cli_functions_create_list_templates() {
  const res = await execa(clipath, ["functions:create", "--ide_templates"])
  return JSON.parse(res.stdout) as FuncTemplateData[]
}

interface FuncTemplateData {
  name: string
  priority: number
  description: string
  lang: string
}
/*
[
  {
    "name": "hello-world",
    "priority": 1,
    "description": "Basic function that shows async/await usage, and response formatting",
    "lang": "js"
  },
*/

{
  cli_functions_create_list_templates()
}