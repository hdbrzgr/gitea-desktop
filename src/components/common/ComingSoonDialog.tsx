/** Temporary placeholder dialog used until a real one is built. */
import { Dialog } from "./Dialog";
import { Button } from "./Button";

interface Props {
  title: string;
  body: string;
  onClose: () => void;
}

export function ComingSoonDialog({ title, body, onClose }: Props) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <p className="text-sm text-[var(--color-fg-muted)]">{body}</p>
    </Dialog>
  );
}
