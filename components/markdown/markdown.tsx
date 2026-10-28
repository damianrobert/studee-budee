import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { common } from "lowlight";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import hcl from "@/lib/hljs-hcl";
import { cn } from "@/lib/utils";

const languages = { ...common, dockerfile, hcl };
const aliases = { bash: ["sh", "zsh", "shell"], yaml: ["yml"], hcl: ["terraform", "tf"] };

const components: Components = {
  a: ({ href, children, node: _node, ...props }) => {
    const external = !!href && /^https?:\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...props}>
        {children}
      </a>
    );
  },
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  img: ({ node: _node, ...props }) => <img loading="lazy" {...props} />,
};

/** Renders user markdown (GFM + highlighted code). Raw HTML is not rendered. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { languages, aliases, plainText: ["txt", "text"] }]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Markdown for a highlighted code block, with a fence longer than any backtick run inside. */
export function codeBlock(code: string, lang: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${code}\n${fence}`;
}
