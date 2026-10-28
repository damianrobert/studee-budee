import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { NavLinks } from "./nav-links";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 text-base font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground"
      >
        sb
      </span>
      studee-budee
    </Link>
  );
}

export function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </form>
  );
}

export function Sidebar({ dueCards }: { dueCards: number }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-muted/30 px-3 py-5 lg:flex">
      <Brand />
      <div className="flex-1">
        <NavLinks dueCards={dueCards} />
      </div>
      <SignOutButton />
    </aside>
  );
}
