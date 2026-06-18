/** Renders the active dialog (if any). */
import { useUiStore } from "../../store/ui";
import { AccountSetupDialog } from "../accounts/AccountSetupDialog";
import { RemoteRepoBrowser } from "../repos/RemoteRepoBrowser";
import { AddLocalRepoDialog } from "../repos/AddLocalRepoDialog";

export function DialogHost() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);

  if (dialog.kind === "none") return null;

  if (dialog.kind === "add-account") {
    return <AccountSetupDialog onClose={close} />;
  }

  if (dialog.kind === "clone") {
    return <RemoteRepoBrowser onClose={close} />;
  }

  if (dialog.kind === "add-local") {
    return <AddLocalRepoDialog onClose={close} />;
  }

  return null;
}
