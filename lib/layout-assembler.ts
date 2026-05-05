export interface LayoutSlot {
  componentName: string;
}

export interface LayoutAssemblyArgs {
  header: LayoutSlot | null;
  footer: LayoutSlot | null;
  nav: LayoutSlot | null;
}

export function assembleRootLayoutTsx(args: LayoutAssemblyArgs): string | null {
  const slots = [args.header, args.nav, args.footer].filter((s): s is LayoutSlot => Boolean(s));
  if (slots.length === 0) return null;
  // `import "./globals.css"` is what triggers Next.js to bundle Tailwind into
  // the route's CSS chunk. Overwriting the user's scaffolded layout strips
  // the import that create-next-app shipped — pages render unstyled without
  // it. See knowledge/open-issues/011.
  const cssImport = 'import "./globals.css";';
  const componentImports = slots.map(s => `import ${s.componentName} from "@/components/${s.componentName}";`).join("\n");
  const headerJsx = args.header ? `<${args.header.componentName} />` : "";
  const navJsx = args.nav ? `<${args.nav.componentName} />` : "";
  const footerJsx = args.footer ? `<${args.footer.componentName} />` : "";
  return `${cssImport}
${componentImports}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        ${headerJsx}${navJsx}{children}${footerJsx}
      </body>
    </html>
  );
}
`;
}
