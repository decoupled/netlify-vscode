export { TreeItem_Menu_create as menu, TreeItem } from "lambdragon"
export { vscode_ThemeIcon_memo as icon } from "x/vscode/vscode_ThemeIcon_memo"
export { observable, computed } from "mobx"
export { observer } from "mobx-react"

import { ComponentPropsWithoutRef } from "react"
import vscode from "vscode"
export const Expanded = vscode.TreeItemCollapsibleState.Expanded
export const Collapsed = vscode.TreeItemCollapsibleState.Collapsed
export const None = vscode.TreeItemCollapsibleState.None

export type TreeItemProps = ComponentPropsWithoutRef<
  typeof import("lambdragon").TreeItem
>
