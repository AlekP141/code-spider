import type {
  GraphSlice,
  NodeId,
  PathInfo,
  PathRoute,
} from "@code-spider/core/types";

export type PathMark = { project: string; nodeId: NodeId; name: string };

export type PathSearch = {
  id: number;
  purpose: "search" | "refresh";
  from: string;
  to: string;
  checked: number;
  routes: number;
  routesCapped: boolean;
};

export type PathFoundMessage = {
  type: "pathFound";
  project: string;
  slice: GraphSlice;
  route: PathRoute;
  path: PathInfo;
  sourceVersion: number;
};

export type PathExtensionMessage =
  | { type: "pathStart"; mark: PathMark | undefined }
  | { type: "pathSearch"; search: PathSearch | undefined }
  | PathFoundMessage;

export type PathWebviewMessage =
  | { type: "pathClick"; project: string; nodeId: NodeId }
  | { type: "cancelPath"; id: number };
