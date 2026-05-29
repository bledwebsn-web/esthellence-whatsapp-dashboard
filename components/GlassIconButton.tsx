"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";

type BaseProps = {
  src: string;
  alt: string;
  ariaLabel: string;
  title?: string;
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
};

type LinkProps = BaseProps & {
  href: string;
  onClick?: never;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">;

type ButtonProps = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type GlassIconButtonProps = LinkProps | ButtonProps;

const baseClassName =
  "relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl transition duration-200 hover:scale-105 hover:bg-white/20 active:scale-95 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.12]";

const imgClassName =
  "h-full w-full object-contain pointer-events-none select-none";

function IconImage({
  src,
  alt,
  className = "",
}: Pick<BaseProps, "src" | "alt" | "className"> & { className?: string }) {
  return <img src={src} alt={alt} className={`${imgClassName} ${className}`} draggable={false} />;
}

export default function GlassIconButton(props: GlassIconButtonProps) {
  const {
    src,
    alt,
    ariaLabel,
    title,
    className = "",
    imgClassName: customImgClassName = "",
    children,
    ...rest
  } = props as GlassIconButtonProps & { className?: string; imgClassName?: string };

  const content = (
    <>
      <IconImage src={src} alt={alt} className={customImgClassName} />
      {children}
    </>
  );

  if ("href" in props) {
    const href = (props as LinkProps).href;
    const linkProps = rest as Omit<LinkProps, keyof BaseProps | "href">;
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        className={`${baseClassName} ${className}`}
        {...linkProps}
      >
        {content}
      </Link>
    );
  }

  const buttonProps = rest as Omit<ButtonProps, keyof BaseProps>;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={`${baseClassName} ${className}`}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
