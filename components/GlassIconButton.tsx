"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";

type BaseProps = {
  src: string;
  alt: string;
  ariaLabel: string;
  title?: string;
  size?: "sm" | "md" | "lg";
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

const sizeClassName: Record<NonNullable<BaseProps["size"]>, string> = {
  sm: "h-[46px] w-[46px]",
  md: "h-[48px] w-[48px]",
  lg: "h-[52px] w-[52px]",
};

const baseClassName =
  "relative inline-flex items-center justify-center overflow-hidden rounded-full border border-slate-200/60 bg-white/10 p-px text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.1)] backdrop-blur-md backdrop-saturate-150 transition duration-200 hover:scale-[1.02] hover:bg-white/16 active:scale-95 dark:border-white/10 dark:bg-slate-950/10 dark:text-slate-200 dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)] dark:hover:bg-slate-950/16";

const imgClassName =
  "block h-[96%] w-[96%] object-contain pointer-events-none select-none drop-shadow-[0_1px_1px_rgba(15,23,42,0.12)]";

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
    size = "md",
    className = "",
    imgClassName: customImgClassName = "",
    children,
    ...rest
  } = props as GlassIconButtonProps & { className?: string; imgClassName?: string };

  const buttonSizeClassName = sizeClassName[size];

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
        className={`${baseClassName} ${buttonSizeClassName} ${className}`}
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
      className={`${baseClassName} ${buttonSizeClassName} ${className}`}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
