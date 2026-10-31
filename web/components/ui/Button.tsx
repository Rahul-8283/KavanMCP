import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "default" | "quiet";

interface Common {
  variant?: Variant;
  small?: boolean;
  className?: string;
  children: ReactNode;
}

type LinkProps = Common & { href: string } & Omit<ComponentProps<"a">, "href" | "className" | "children">;
type ButtonProps = Common & { href?: undefined } & Omit<ComponentProps<"button">, "className" | "children">;

const VARIANT: Record<Variant, string> = {
  primary: "btn btn-primary",
  default: "btn",
  quiet: "btn btn-quiet",
};

/** One control for both jobs: an <a> when it has an href, a real <button> otherwise. */
export function Button(props: LinkProps | ButtonProps) {
  const { variant = "default", small = false, className = "", children, ...rest } = props;
  const classes = `${VARIANT[variant]}${small ? " btn-sm" : ""}${className ? ` ${className}` : ""}`;

  if (typeof rest.href === "string") {
    const { href, ...anchor } = rest as Omit<LinkProps, keyof Common>;
    return (
      <a href={href} className={classes} {...anchor}>
        {children}
      </a>
    );
  }
  const button = rest as Omit<ButtonProps, keyof Common | "href">;
  return (
    <button type="button" className={classes} {...button}>
      {children}
    </button>
  );
}
