import { useTranslation } from "react-i18next";
export function FileInput({
  label,
  accept,
  onSelect,
}: {
  label: string;
  accept: string;
  onSelect: (file: File) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="file-control">
      {label}
      <span className="file-box" aria-hidden="true">
        {t("chooseFile")}
      </span>
      <input
        aria-label={label}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
