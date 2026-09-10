import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  Check,
  FileText,
  Keyboard,
  LockKeyhole,
  Plus,
  RadioTower,
  Send,
  SlidersHorizontal,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Busy, CardTitle, Empty, ignored } from "../ui-shared";
import {
  publicToEditable,
  settingsSchema,
  type Config,
  type SettingsValues,
} from "../lib/contracts";
import validateConfig from "../generated/config.js";
import { useApp } from "../store/app";

export function Settings() {
  const c = useApp((s) => s.snapshot?.config);
  return c ? (
    <SettingsForm config={c} />
  ) : (
    <article className="card">
      <Empty icon={SlidersHorizontal} title="Настройки ещё не загружены">
        Подключите Python. Интерфейс не подставляет и не сохраняет
        демонстрационную конфигурацию.
      </Empty>
    </article>
  );
}

function SettingsForm({ config }: { config: Config }) {
  const s = useApp();
  const locked = s.busy || !!s.snapshot?.active || !!s.snapshot?.prepared;
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { ...publicToEditable(config), api_hash: "", api_key: "" },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "presets",
    keyName: "_key",
  });
  const watchedPresets = useWatch({ control, name: "presets" });
  const [localError, setLocalError] = useState<string | null>(null);
  const save = handleSubmit(async (values) => {
    setLocalError(null);
    const { api_key, api_hash, ...raw } = values;
    const editable = { ...raw, version: 1 };
    if (!validateConfig(editable)) {
      setLocalError("Параметры не соответствуют JSON Schema адаптера.");
      return;
    }
    try {
      await s.run("save", {
        ...editable,
        ...(api_key ? { api_key } : {}),
        ...(api_hash ? { api_hash } : {}),
      });
      reset({ ...values, api_hash: "", api_key: "" });
    } catch {
      setValue("api_key", "");
      setValue("api_hash", "");
    }
  });
  return (
    <form onSubmit={(e) => void save(e)} className="settings-form">
      <div className="settings-grid">
        <article className="card">
          <CardTitle icon={Keyboard}>Ритм печати</CardTitle>
          <div className="field-grid">
            <label>
              Слов в минуту
              <input
                type="number"
                min={25}
                max={300}
                disabled={locked}
                {...register("wpm", { valueAsNumber: true })}
              />
              {errors.wpm && <small role="alert">{errors.wpm.message}</small>}
            </label>
            <label>
              Слов в сообщении
              <input
                type="number"
                min={1}
                max={16}
                disabled={locked}
                {...register("words", { valueAsNumber: true })}
              />
              {errors.words && (
                <small role="alert">{errors.words.message}</small>
              )}
            </label>
          </div>
          <p className="field-hint">
            Backend делит текст на фрагменты и нажимает Enter после каждого.
            Скорость ограничена 25–300 WPM. Эти параметры не применяются к живой
            печати.
          </p>
        </article>
        <article className="card">
          <CardTitle icon={RadioTower}>Прочее</CardTitle>
          <label className="consent">
            <input
              type="checkbox"
              disabled={locked || !config.live_calibrated}
              {...register("live_enabled")}
            />
            <span>
              <strong>Живая печать</strong>
              <br />
              Одно обычное физическое нажатие выводит следующий символ
              подготовленного текста. Enter и системные сочетания не
              подменяются.
            </span>
          </label>
          <div className="detail-row">
            <span>Калибровка</span>
            <strong>
              {config.live_calibrated
                ? (config.live_device ?? "Сохранена")
                : "Не выполнена"}
            </strong>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={locked || isDirty}
            onClick={() => void s.run("calibrate").catch(ignored)}
          >
            <Keyboard size={16} />
            Калибровать клавиатуру
          </Button>
          <p className="field-hint">
            После запуска калибровки нажмите и отпустите F7 в течение 12 секунд.
            Если клавиатура или USB-порт изменились, выполните калибровку снова.
          </p>
        </article>
        <article className="card">
          <CardTitle icon={Send}>Telegram API</CardTitle>
          <div className="field-grid">
            <label>
              API ID
              <input
                readOnly={locked || !!s.snapshot?.profile}
                {...register("api_id")}
              />
            </label>
            <label>
              Телефон
              <input
                autoComplete="tel"
                placeholder="+7…"
                readOnly={locked || !!s.snapshot?.profile}
                {...register("phone")}
              />
            </label>
          </div>
          <label>
            API hash{" "}
            <span className="field-hint">
              {config.has_api_hash ? "сохранён в DPAPI" : "не задан"}
            </span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Оставьте пустым, чтобы не менять"
              readOnly={locked || !!s.snapshot?.profile}
              {...register("api_hash")}
            />
            {errors.api_hash && (
              <small role="alert">{errors.api_hash.message}</small>
            )}
          </label>
          <p className="field-hint">
            Получите реквизиты на my.telegram.org. Для изменения аккаунта
            сначала выйдите из Telegram.
          </p>
        </article>
        <article className="card provider-settings">
          <CardTitle icon={Zap}>LLM-провайдер</CardTitle>
          <label>
            Base URL
            <input readOnly={locked} {...register("base_url")} />
            {errors.base_url && (
              <small role="alert">{errors.base_url.message}</small>
            )}
          </label>
          <div className="field-grid">
            <label>
              Модель
              <input readOnly={locked} {...register("model")} />
            </label>
            <label>
              API key{" "}
              <span className="field-hint">
                {config.has_api_key ? "сохранён" : "не задан"}
              </span>
              <input
                type="password"
                autoComplete="off"
                readOnly={locked}
                placeholder="Оставьте пустым, чтобы не менять"
                {...register("api_key")}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={locked || isDirty}
            onClick={() =>
              void s
                .run("test")
                .then(() =>
                  setLocalError("Проверка завершена: провайдер ответил."),
                )
                .catch(ignored)
            }
          >
            <Activity size={16} />
            Проверить сохранённое подключение
          </Button>
          <p className="field-hint">
            Проверка отправляет короткий тестовый запрос, без истории чата.
            Может расходовать лимит API.
          </p>
        </article>
      </div>
      <article className="card presets-panel">
        <CardTitle icon={FileText}>Характер ответа</CardTitle>
        <label>
          Активный пресет
          <select disabled={locked} {...register("active_preset")}>
            {fields.map((field, index) => (
              <option
                key={field._key}
                value={watchedPresets?.[index]?.id ?? field.id}
              >
                {index + 1}. {watchedPresets?.[index]?.name ?? field.name}
              </option>
            ))}
          </select>
        </label>
        <div className="presets-grid">
          {fields.map((field, index) => (
            <div className="preset-editor" key={field._key}>
              <div className="preset-top">
                <span>ПРЕСЕТ {String(index + 1).padStart(2, "0")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Удалить пресет ${index + 1}`}
                  disabled={locked || fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
              <input type="hidden" {...register(`presets.${index}.id`)} />
              <label>
                Название
                <input
                  readOnly={locked}
                  {...register(`presets.${index}.name`)}
                />
              </label>
              {field.prompts.map((_, prompt) => (
                <label key={prompt}>
                  Системный промпт {prompt + 1}
                  <textarea
                    rows={4}
                    readOnly={locked}
                    {...register(`presets.${index}.prompts.${prompt}`)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={locked || fields.length >= 30}
          onClick={() =>
            append({
              id: crypto.randomUUID(),
              name: "Новый пресет",
              prompts: ["Отвечай кратко и по существу."],
            })
          }
        >
          <Plus size={16} />
          Добавить пресет
        </Button>
      </article>
      {(localError || Object.keys(errors).length > 0) && (
        <p role="status" className="notice-banner">
          {localError ??
            "Проверьте поля: имя и промпт не должны быть пустыми; ID — уникальны; активный пресет должен существовать."}
        </p>
      )}
      <div className="save-bar">
        <span>
          <LockKeyhole size={16} />
          Ключи не возвращаются в интерфейс и не попадают в журнал.
        </span>
        <Button type="submit" disabled={locked || !isDirty}>
          {s.busy ? <Busy /> : <Check size={16} />}Сохранить настройки
        </Button>
      </div>
    </form>
  );
}
