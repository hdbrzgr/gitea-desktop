/** Native OS dialog wrappers. Currently used for the folder picker in the
 * "Add local repository" flow; the dialog plugin is also capable of file
 * pickers and message boxes if needed later. */
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Open the native OS folder picker (Finder on macOS) and return the selected
 * directory's absolute path, or `null` if the user cancelled.
 */
export async function pickDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose a repository folder",
  });
  // `open` with multiple:false returns string | null.
  return typeof selected === "string" ? selected : null;
}
