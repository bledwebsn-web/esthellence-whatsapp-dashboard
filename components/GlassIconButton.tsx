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
  sm: "h-11 w-11",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

const imageInsetClassName: Record<NonNullable<BaseProps["size"]>, string> = {
  sm: "inset-[11%]",
  md: "inset-[9%]",
  lg: "inset-[8%]",
};

const baseClassName =
  "relative inline-flex items-center justify-center overflow-hidden rounded-full border border-slate-200/60 bg-white/30 text-slate-700 shadow-[0_12px_35px_rgba(15,23,42,0.14)] backdrop-blur-xl backdrop-saturate-150 transition duration-200 hover:scale-[1.03] hover:bg-white/40 active:scale-95 dark:border-white/15 dark:bg-slate-950/28 dark:text-slate-200 dark:shadow-[0_12px_35px_rgba(0,0,0,0.34)] dark:hover:bg-slate-950/38";

const imgClassName =
  "h-full w-full object-contain pointer-events-none select-none drop-shadow-[0_1px_2px_rgba(15,23,42,0.18)]";

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
  const buttonImageInsetClassName = imageInsetClassName[size];

  const content = (
    <>
      <span className={`absolute ${buttonImageInsetClassName} flex items-center justify-center`}>
        <IconImage
          src={src}
          alt={alt}
          className={`${customImgClassName} h-full w-full`}
        />
      </span>
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
