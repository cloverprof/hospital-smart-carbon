import { PRODUCT_ENGLISH_NAME, PRODUCT_NAME } from "../data/config";

const BRAND_WORDMARK = `${import.meta.env.BASE_URL}brand/timeloit-wordmark.png`;

type BrandLockupProps = {
  className?: string;
  title?: string;
  variant?: "topbar" | "login";
};

export function BrandLockup({ className = "", title, variant = "topbar" }: BrandLockupProps) {
  return (
    <div
      className={["brand-lockup", `brand-lockup--${variant}`, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={`Timeloit，${PRODUCT_NAME}，${PRODUCT_ENGLISH_NAME}`}
      title={title}
    >
      <img className="brand-lockup__wordmark" src={BRAND_WORDMARK} alt="" />
      <span className="brand-lockup__divider" aria-hidden="true" />
      <span className="brand-lockup__names">
        <strong>{PRODUCT_NAME}</strong>
        <small>{PRODUCT_ENGLISH_NAME}</small>
      </span>
    </div>
  );
}
