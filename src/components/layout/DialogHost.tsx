/** Renders the active dialog (if any). */
import { useUiStore } from "../../store/ui";
import { useReposStore } from "../../store/repos";
import { AccountSetupDialog } from "../accounts/AccountSetupDialog";
import { RemoteRepoBrowser } from "../repos/RemoteRepoBrowser";
import { AddLocalRepoDialog } from "../repos/AddLocalRepoDialog";
import { SubmodulesDialog } from "../submodules/SubmodulesDialog";
import { SettingsDialog } from "../settings/SettingsDialog";

export function DialogHost() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  const activeRepoId = useUiStore((s) => s.activeRepoId);
  const repos = useReposStore((s) => s.repos);
  const repo = repos.find((r) => r.id === activeRepoId);

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

  if (dialog.kind === "submodules" && repo) {
    return (
      <SubmodulesDialog
        repoId={repo.id}
        repoName={repo.name}
        onClose={close}
      />
    );
  }

  if (dialog.kind === "settings") {
    return <SettingsDialog onClose={close} />;
  }

  return null;
}
