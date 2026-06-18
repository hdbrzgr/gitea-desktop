/** Root application component: lays out sidebar + main column + dialog host. */
import { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Toolbar } from "./components/layout/Toolbar";
import { TabBar } from "./components/layout/TabBar";
import { Content } from "./components/layout/Content";
import { DialogHost } from "./components/layout/DialogHost";
import { useAccountsStore } from "./store/accounts";
import { useReposStore } from "./store/repos";

export default function App() {
  const refreshAccounts = useAccountsStore((s) => s.refresh);
  const refreshRepos = useReposStore((s) => s.refresh);

  // Load configured accounts + repos on startup.
  useEffect(() => {
    refreshAccounts();
    refreshRepos();
  }, [refreshAccounts, refreshRepos]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <TabBar />
        <Content />
      </div>
      <DialogHost />
    </div>
  );
}
