"use client";

/**
 * VideoRoom — embed da videochamada Daily.co dentro do app.
 *
 * Uso:
 *   <VideoRoom appointmentId="uuid" roomUrl="https://..." meetingToken="..." />
 *
 * O componente gerencia o ciclo de vida do DailyCall:
 *   joining → joined → left/error
 */

import { useCallback, useEffect, useRef, useState } from "react";

type CallState = "idle" | "joining" | "joined" | "left" | "error";

interface VideoRoomProps {
  appointmentId: string;
  roomUrl: string;
  meetingToken?: string;   // undefined = paciente sem token; string = psicóloga com token de host
  onLeft?: () => void;
}

export default function VideoRoom({
  appointmentId,
  roomUrl,
  meetingToken,
  onLeft,
}: VideoRoomProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callRef = useRef<any>(null);
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);

  const join = useCallback(async () => {
    if (!frameRef.current || callRef.current) return;
    setState("joining");

    try {
      // Importação dinâmica — Daily.co só roda no browser
      const DailyIframe = (await import("@daily-co/daily-js")).default;

      const call = DailyIframe.createFrame(frameRef.current, {
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "12px",
        },
        showLeaveButton: true,
        showFullscreenButton: true,
      });

      callRef.current = call;

      call.on("joined-meeting", () => setState("joined"));
      call.on("left-meeting", () => {
        setState("left");
        onLeft?.();
      });
      call.on("error", (ev: { errorMsg?: string }) => {
        setError(ev?.errorMsg ?? "Erro na videochamada.");
        setState("error");
      });

      await call.join({
        url: roomUrl,
        ...(meetingToken ? { token: meetingToken } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar.");
      setState("error");
    }
  }, [roomUrl, meetingToken, onLeft]);

  // Inicia ao montar
  useEffect(() => {
    join();
    return () => {
      if (callRef.current) {
        callRef.current.destroy();
        callRef.current = null;
      }
    };
  }, [join]);

  return (
    <div className="flex flex-col gap-3">
      {/* Container do iframe */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-zinc-900"
        style={{ aspectRatio: "16/9" }}
      >
        <div ref={frameRef} className="absolute inset-0" />

        {/* Overlay de estado */}
        {state === "idle" || state === "joining" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Spinner />
            <span className="text-sm text-zinc-400">Conectando à sessão…</span>
          </div>
        ) : null}

        {state === "left" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white bg-zinc-900/90">
            <span className="text-lg font-medium">Sessão encerrada</span>
            <span className="text-sm text-zinc-400">
              Você saiu da videochamada.
            </span>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white bg-zinc-900/90">
            <span className="text-lg font-medium text-red-400">
              Erro na conexão
            </span>
            <span className="text-sm text-zinc-400">{error}</span>
            <button
              onClick={() => {
                setState("idle");
                setError(null);
                callRef.current = null;
                join();
              }}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
      </div>

      {/* Barra de status */}
      {state === "joined" && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Sessão em andamento
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-zinc-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}
