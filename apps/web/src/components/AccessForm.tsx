import { useId, useState } from "react";
import { getToken, setToken } from "../api/token.js";

/** Campo para el token de acceso. Solo aparece plegado en la cabecera; no hace falta si la API no lo pide. */
export function AccessForm() {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(getToken() !== null);

  return (
    <details className="access">
      <summary>{saved ? "Token de acceso guardado" : "Token de acceso"}</summary>
      <form
        className="access-form"
        onSubmit={(event) => {
          event.preventDefault();
          setToken(value);
          setSaved(getToken() !== null);
          setValue("");
        }}
      >
        <label htmlFor={inputId}>Solo si la API lo exige</label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <button type="submit">Guardar en esta pestaña</button>
      </form>
    </details>
  );
}
