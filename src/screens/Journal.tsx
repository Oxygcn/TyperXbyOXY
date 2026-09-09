import { Activity, ArrowDownLeft } from "lucide-react";
import { CardTitle, Empty } from "../ui-shared";
import { useApp } from "../store/app";

export function Journal() {
  const entries = useApp((s) => s.entries);
  return (
    <article className="card journal">
      <CardTitle icon={Activity}>
        События движка <span className="count-badge">{entries.length}</span>
      </CardTitle>
      <p className="field-hint">
        Последние 100 переходов состояния, только в памяти. Содержимое чатов,
        коды входа и пароли здесь не отображаются.
      </p>
      {entries.length ? (
        <ol className="event-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="event-marker">
                <ArrowDownLeft size={16} />
              </span>
              <time>{e.time}</time>
              <strong>{e.detail}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon={Activity} title="Чистый лист">
          Когда движок изменит состояние, событие появится здесь.
        </Empty>
      )}
    </article>
  );
}
