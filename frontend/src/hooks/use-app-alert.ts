import { useState } from "react"

export function useAppAlert() {
    const [alertState, setAlertState] = useState<{ title: string; description: string } | null>(null)

    const showAlert = (title: string, description: string) => setAlertState({ title, description })
    const closeAlert = () => setAlertState(null)

    return { alertState, showAlert, closeAlert }
}
