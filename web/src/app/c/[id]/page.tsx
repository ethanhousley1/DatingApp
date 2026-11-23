import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import Chat from "./chat";

// The conversation id comes from the URL at request time, so the chat streams
// in behind a Suspense boundary.
export default function ConversationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Chat />
    </Suspense>
  );
}
