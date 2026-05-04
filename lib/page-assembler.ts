export interface RouteEntry {
  sourceUrl: string;
  nextRoute: string;
  params: Record<string, string>;
  kind: "static" | "dynamic";
}

export interface RouteGroup {
  nextRoute: string;
  kind: "static" | "dynamic";
  entries: { sourceUrl: string; params: Record<string, string> }[];
}

export function groupRoutesByNextRoute(routes: RouteEntry[]): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const r of routes) {
    const existing = map.get(r.nextRoute);
    if (existing) {
      existing.entries.push({ sourceUrl: r.sourceUrl, params: r.params });
    } else {
      map.set(r.nextRoute, {
        nextRoute: r.nextRoute,
        kind: r.kind,
        entries: [{ sourceUrl: r.sourceUrl, params: r.params }],
      });
    }
  }
  return Array.from(map.values());
}

export interface AssemblePageArgs {
  group: RouteGroup;
  sectionRefs: { componentName: string }[];
}

export function assemblePageTsx(args: AssemblePageArgs): string {
  const uniqueImports = Array.from(new Set(args.sectionRefs.map(s => s.componentName)));
  const importLines = uniqueImports.map(n => `import ${n} from "@/components/${n}";`).join("\n");
  const renders = args.sectionRefs.map(s => `      <${s.componentName} />`).join("\n");

  if (args.group.kind === "static") {
    return `${importLines}

export default function Page() {
  return (
    <>
${renders}
    </>
  );
}
`;
  }

  const params = JSON.stringify(args.group.entries.map(e => e.params));
  return `${importLines}

export async function generateStaticParams() {
  return ${params};
}

export default function Page() {
  return (
    <>
${renders}
    </>
  );
}
`;
}
