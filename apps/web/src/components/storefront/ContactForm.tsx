"use client";
/**
 * The enquiry form section — the point of a service storefront.
 *
 * A plumber, a studio or a consultancy cannot put a price in a basket, so the
 * conversion here is a question, not a checkout. The merchant designs the
 * questions in the dashboard's form builder and the backend hands us the field
 * list; this renders whatever it is given and knows nothing about any
 * particular field. A field type added to `ServiceForm.FIELD_TYPES` needs one
 * new branch in `Field` below and nothing else.
 *
 * Validation is deliberately thin here. The browser checks `required` and the
 * input types, and the backend re-checks everything properly — a phone number
 * written the Cameroonian way must not be rejected by a regex I invented, and
 * the messages a visitor sees on a 400 are the backend's own, shown under the
 * input they belong to.
 */
import React, { useEffect, useRef, useState } from "react";
import { LuCircleCheck, LuLoader, LuSend, LuTriangleAlert } from "react-icons/lu";
import { publicStorefrontApi } from "../../lib/api";
import { useStorefront } from "../StorefrontProvider";
import { ENQUIRY_ANCHOR, ENQUIRY_EVENT, SectionProps, str } from "./shared";
import type { ServiceFormField } from "../../types/storefront";

/** Mirrors `enquiries.MAX_LENGTHS`, so a visitor is stopped before the 400. */
const MAX_LENGTHS: Record<string, number> = {
  text: 300,
  email: 254,
  tel: 40,
  number: 30,
  date: 40,
  select: 200,
  radio: 200,
  textarea: 5000,
};

/** A single answer. Booleans are single tick boxes; arrays are checkbox groups. */
type Value = string | string[] | boolean;

function emptyValue(field: ServiceFormField): Value {
  if (field.type === "checkboxes") return [];
  if (field.type === "checkbox") return false;
  return "";
}

/** The `<input type>` for a field, where the field maps onto a plain input. */
const INPUT_TYPE: Record<string, string> = {
  text: "text",
  email: "email",
  tel: "tel",
  number: "text", // text, not number: "2 or 3" is a real answer to "how many?"
  date: "date",
};

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: ServiceFormField;
  value: Value;
  error?: string;
  onChange: (next: Value) => void;
}) {
  const id = `sf-cf-${field.key}`;
  const options = field.options ?? [];
  const described = error ? `${id}-err` : field.help ? `${id}-help` : undefined;

  const control = (() => {
    switch (field.type) {
      case "textarea":
        return (
          <textarea
            id={id}
            rows={5}
            required={field.required}
            maxLength={MAX_LENGTHS.textarea}
            placeholder={field.placeholder}
            aria-describedby={described}
            aria-invalid={error ? true : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={event => onChange(event.target.value)}
          />
        );

      case "select":
        return (
          <select
            id={id}
            required={field.required}
            aria-describedby={described}
            aria-invalid={error ? true : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={event => onChange(event.target.value)}
          >
            <option value="">{field.placeholder || "Choose one…"}</option>
            {options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );

      case "radio":
        return (
          <div className="sf-cf-choices" role="radiogroup" aria-labelledby={`${id}-lbl`}>
            {options.map(option => (
              <label key={option} className="sf-cf-choice">
                <input
                  type="radio"
                  name={field.key}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case "checkboxes": {
        const chosen = Array.isArray(value) ? value : [];
        return (
          <div className="sf-cf-choices">
            {options.map(option => (
              <label key={option} className="sf-cf-choice">
                <input
                  type="checkbox"
                  value={option}
                  checked={chosen.includes(option)}
                  onChange={event =>
                    onChange(
                      event.target.checked
                        ? [...chosen, option]
                        : chosen.filter(c => c !== option),
                    )
                  }
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      }

      case "checkbox":
        // Its own label, so the wording sits beside the box rather than above
        // it — a lone tick box under a heading reads as an orphan.
        return (
          <label className="sf-cf-choice">
            <input
              id={id}
              type="checkbox"
              required={field.required}
              checked={value === true}
              aria-describedby={described}
              onChange={event => onChange(event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        );

      default:
        return (
          <input
            id={id}
            type={INPUT_TYPE[field.type] ?? "text"}
            required={field.required}
            maxLength={MAX_LENGTHS[field.type] ?? MAX_LENGTHS.text}
            placeholder={field.placeholder}
            aria-describedby={described}
            aria-invalid={error ? true : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={event => onChange(event.target.value)}
          />
        );
    }
  })();

  return (
    <div className={`sf-cf-f${field.width === "half" ? " sf-cf-half" : ""}`}>
      {field.type !== "checkbox" && (
        <label id={`${id}-lbl`} htmlFor={id} className="sf-cf-lbl">
          {field.label}
          {field.required && <span className="sf-cf-req" aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      {field.help && !error && (
        <p id={`${id}-help`} className="sf-cf-help">{field.help}</p>
      )}
      {error && (
        <p id={`${id}-err`} className="sf-cf-err" role="alert">{error}</p>
      )}
    </div>
  );
}

export default function ContactForm({ s }: SectionProps) {
  const { store, service_form, isPreview } = useStorefront();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Record<string, Value>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const fields = service_form?.fields ?? [];

  // Seed once the form arrives, and re-seed if the merchant changes the fields
  // in the editor while the preview is open.
  useEffect(() => {
    setValues(Object.fromEntries(fields.map(f => [f.key, emptyValue(f)])));
  }, [service_form]);

  /**
   * A product card sent someone here, so say what they were looking at.
   *
   * The fields are the merchant's own, so there is no named field to fill —
   * the longest free-text field is the one a description belongs in, and it is
   * only touched while still empty so this can never overwrite typing.
   */
  useEffect(() => {
    const onRequest = (event: Event) => {
      const product = (event as CustomEvent<{ product?: string }>).detail?.product;
      if (!product) return;
      const target = fields.find(f => f.type === "textarea");
      if (!target) return;
      setValues(prev =>
        prev[target.key] ? prev : { ...prev, [target.key]: `I would like a quote for ${product}.` },
      );
    };
    window.addEventListener(ENQUIRY_EVENT, onRequest);
    return () => window.removeEventListener(ENQUIRY_EVENT, onRequest);
  }, [fields]);

  if (!s.enabled) return null;

  // `service_form` is null when the merchant has switched the form off. On a
  // live storefront that means render nothing rather than an empty box; in the
  // editor it means say why, because an invisible section looks like a bug.
  if (!service_form || fields.length === 0) {
    if (!isPreview) return null;
    return (
      <section className="sf-cf" id={ENQUIRY_ANCHOR}>
        <div className="sf-cf-i sf-cf-empty">
          <LuTriangleAlert size={20} />
          <p>
            This section shows your enquiry form. Add fields to it under
            <strong> Enquiry Form</strong> in your store menu and it will appear here.
          </p>
        </div>
      </section>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setErrors({});

    try {
      const { data } = await publicStorefrontApi.submitEnquiry(store.slug, values);
      setSent(data.message || service_form.success_message);
      setValues(Object.fromEntries(fields.map(f => [f.key, emptyValue(f)])));
    } catch (error) {
      const response = (error as { response?: { data?: { errors?: Record<string, string>; detail?: string } } }).response;
      const received = response?.data?.errors;
      if (received && typeof received === "object") {
        setErrors(received);
        // Scroll the first complaint into view: on a long form the message may
        // be well above the button that was just pressed.
        const firstKey = fields.find(f => received[f.key])?.key;
        const node = firstKey ? formRef.current?.querySelector(`[id="sf-cf-${firstKey}"]`) : null;
        (node as HTMLElement | null)?.focus?.();
      } else {
        setErrors({ __all__: response?.data?.detail || "That did not send. Please try again." });
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section className="sf-cf" id={ENQUIRY_ANCHOR}>
        <div className="sf-cf-i sf-cf-done">
          <LuCircleCheck size={34} />
          <h2 className="sf-d">Thank you</h2>
          <p>{sent}</p>
          <button type="button" className="sf-cf-again" onClick={() => setSent(null)}>
            Send another
          </button>
        </div>
      </section>
    );
  }

  const blurb = str(s.settings.subtitle, service_form.description);

  return (
    <section className="sf-cf" id={ENQUIRY_ANCHOR}>
      <div className="sf-cf-i">
        <header className="sf-cf-h">
          <h2 className="sf-d">{str(s.settings.title, service_form.title || "Get in touch")}</h2>
          {blurb && <p>{blurb}</p>}
        </header>

        {errors.__all__ && (
          <p className="sf-cf-banner" role="alert">
            <LuTriangleAlert size={15} /> {errors.__all__}
          </p>
        )}

        <form ref={formRef} className="sf-cf-form" onSubmit={submit} noValidate={false}>
          {fields.map(field => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key] ?? emptyValue(field)}
              error={errors[field.key]}
              onChange={next => setValues(prev => ({ ...prev, [field.key]: next }))}
            />
          ))}

          <div className="sf-cf-actions">
            <button type="submit" className="sf-cf-send" disabled={sending}>
              {sending ? <LuLoader size={15} className="sf-spin" /> : <LuSend size={15} />}
              {sending ? "Sending…" : service_form.submit_label || "Send enquiry"}
            </button>
            {store.phone && (
              <a className="sf-cf-call" href={`tel:${store.phone}`}>Or call {store.phone}</a>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
