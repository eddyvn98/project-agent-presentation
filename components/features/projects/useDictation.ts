"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
	lang: string; continuous: boolean; interimResults: boolean;
	onresult: ((event: RecognitionEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null;
	start: () => void; stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
	if (typeof window === "undefined") return null;
	const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
	return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Browser speech-to-text; `onText` receives each finalized phrase. `supported` is false where the API is missing. */
export function useDictation(onText: (text: string) => void) {
	const [listening, setListening] = useState(false);
	const [supported, setSupported] = useState(false);
	const recognitionRef = useRef<Recognition | null>(null);
	const onTextRef = useRef(onText);
	onTextRef.current = onText;

	useEffect(() => { setSupported(Boolean(recognitionCtor())); return () => recognitionRef.current?.stop(); }, []);

	const toggle = useCallback(() => {
		if (recognitionRef.current) { recognitionRef.current.stop(); return; }
		const Ctor = recognitionCtor();
		if (!Ctor) return;
		const recognition = new Ctor();
		recognition.lang = navigator.language || "en-US";
		recognition.continuous = true;
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			for (let index = event.resultIndex; index < event.results.length; index++) {
				const result = event.results[index];
				if (result.isFinal) onTextRef.current(result[0].transcript.trim());
			}
		};
		const finish = () => { recognitionRef.current = null; setListening(false); };
		recognition.onend = finish;
		recognition.onerror = finish;
		recognitionRef.current = recognition;
		setListening(true);
		recognition.start();
	}, []);

	return { supported, listening, toggle };
}
