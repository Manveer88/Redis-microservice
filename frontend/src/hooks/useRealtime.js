import { useContext } from "react";
import { RealtimeContext } from "../context/contexts";

export default function useRealtime() {
    return useContext(RealtimeContext);
}
