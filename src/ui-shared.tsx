import { useEffect, useState, type ReactNode } from "react";
import { Activity, LoaderCircle, Unplug, UserRound } from "lucide-react";
import { useApp } from "./store/app";

export const ignored = () => {};

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function Avatar({ large = false }: { large?: boolean }) {
  const p = useApp((s) => s.snapshot?.profile);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p?.avatar]);
  return (
    <span className={`avatar ${large ? "avatar-large" : ""}`}>
      {p?.avatar && !failed ? (
        <img
          alt={`Фото Telegram: ${p.name}`}
          src={p.avatar}
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound size={large ? 32 : 20} aria-hidden="true" />
      )}
    </span>
  );
}

export function Empty({
  icon: Icon = Unplug,
  title,
  children,
}: {
  icon?: typeof Activity;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={24} />
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function CardTitle({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon?: typeof Activity;
}) {
  return (
    <div className="card-heading">
      <h2>{children}</h2>
      {Icon && <Icon size={18} aria-hidden="true" />}
    </div>
  );
}

export function Busy() {
  return <LoaderCircle className="spin" size={16} />;
}
