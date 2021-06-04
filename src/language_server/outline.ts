import { OutlineInfoResolver } from "src/structure/model/types"
import { memo } from "src/x/decorators"
import {
  RemoteTreeDataProviderImpl,
  RemoteTreeDataProvider_publishOverLSPConnection,
} from "src/x/vscode"

import { NetlifyLanguageServer } from "./NetlifyLanguageServer"

export class OutlineManager {
  constructor(public server: NetlifyLanguageServer) {}

  @memo() start() {
    const getRoot = async () => {
      const p = this.server.getProject()
      if (!p)
        return {
          async children() {
            return [{ label: "No Netlify project found..." }]
          },
        }
      const oif = new OutlineInfoResolver(p)
      return await oif.treeItem()
    }

    const tdp = new RemoteTreeDataProviderImpl(getRoot, 10000)
    const methodPrefix = "netlify/x-outline-"
    RemoteTreeDataProvider_publishOverLSPConnection(
      tdp,
      this.server.connection,
      methodPrefix
    )
  }
}
