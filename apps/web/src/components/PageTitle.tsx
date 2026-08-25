"use client";

import { useEffect } from "react";

/**
 * Sets the browser tab's title for a client-rendered dashboard page.
 *
 * These pages used `<Head><title>…</title></Head>` from `next/head`, which is a
 * silent no-op in the App Router: `next/head`'s `SideEffect` renders null and
 * pushes its children through `HeadManagerContext`, whose App Router value is an
 * empty object — so `mountedInstances` is undefined, the change never emits, and
 * the title element is never rendered anywhere. Every dashboard page has been
 * showing the marketing title from the root layout.
 *
 * React 19's own hoisting of a bare `<title>` does not fix it either. The root
 * layout exports `metadata.title`, so a `<title>` already sits in `<head>`, and
 * per the HTML spec `document.title` reads the *first* one in the document —
 * a hoisted second element would be ignored. Assigning `document.title` is the
 * only mechanism that reliably wins.
 *
 * Every dashboard route is behind auth, so nothing crawls these pages and there
 * is no reason to want the title in the server-rendered HTML. The tab, the
 * history entry and the bookmark are the whole audience, and all three read
 * `document.title`.
 *
 * The title is not restored on unmount: the page being navigated to sets its
 * own, and a restore would race that.
 */
export default function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}
