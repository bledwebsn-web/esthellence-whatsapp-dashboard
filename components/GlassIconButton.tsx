"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  sm: "h-[54px] w-[54px]",
  md: "h-[58px] w-[58px]",
  lg: "h-[56px] w-[56px]",
};

const sizePxMap: Record<NonNullable<BaseProps["size"]>, number> = {
  sm: 54,
  md: 58,
  lg: 56,
};

const baseClassName =
  "relative inline-flex shrink-0 items-center justify-center rounded-full overflow-visible p-0 m-0 border-0 bg-transparent shadow-none transition-transform duration-200 active:scale-95";

const imgClassName =
  "block h-full w-full object-contain pointer-events-none select-none";

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
  const sizeStyle = {
    width: `${sizePxMap[size]}px`,
    height: `${sizePxMap[size]}px`,
  } as const;

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
        style={sizeStyle}
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
      style={sizeStyle}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
