import type { OwnedFileView } from "@/components/drive/types";
import type { DriveFolder } from "@/lib/drive/file-metadata";

export type ShareTarget =
  | { type: "file"; file: OwnedFileView }
  | { type: "folder"; folder: DriveFolder; files: OwnedFileView[] };
