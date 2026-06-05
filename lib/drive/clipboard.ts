export type DriveClipboardItem =
  | {
      kind: "file";
      blobId: string;
      name: string;
      sourceFolderId: string | null;
      mode: "cut" | "copy";
    }
  | {
      kind: "folder";
      folderId: string;
      name: string;
      sourceParentId: string | null;
      mode: "cut" | "copy";
    };

export type DriveClipboard = {
  items: DriveClipboardItem[];
} | null;
