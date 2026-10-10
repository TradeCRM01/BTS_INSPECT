import { useQuery } from '@tanstack/react-query';
import {
  conversationDirectionLabel,
  conversationMessageTime,
  conversationMessagesForLook,
  conversationStateLabel,
  conversationVisible,
  loadConversationByApprovedJob,
  loadConversationByCallerPhone,
  shouldQueryLiveConversation,
  type ConversationMessage,
} from '../../lib/enquiryConversation';

export function useEnquiryConversation(input: {
  look: string | null | undefined;
  companyId: string | null | undefined;
  callerPhone?: string | null;
  approvedJobId?: string | null;
}): ConversationMessage[] {
  const seeded = conversationMessagesForLook(input.look, input.callerPhone);
  const { data } = useQuery({
    queryKey: [
      'enquiry-conversation',
      input.companyId,
      input.callerPhone ?? '',
      input.approvedJobId ?? '',
    ],
    queryFn: () => (
      input.approvedJobId
        ? loadConversationByApprovedJob(input.companyId!, input.approvedJobId)
        : loadConversationByCallerPhone(input.companyId!, input.callerPhone)
    ),
    enabled: shouldQueryLiveConversation(input.look)
      && Boolean(input.companyId)
      && Boolean(input.approvedJobId || input.callerPhone),
    retry: false,
  });
  return seeded ?? data ?? [];
}

export function EnquiryConversation({
  messages,
  timeZone,
}: {
  messages: ConversationMessage[] | null | undefined;
  timeZone?: string | null;
}) {
  if (!conversationVisible(messages)) return null;
  return (
    <section
      className="ops-tray hub-enquiry-conversation"
      data-enquiry-conversation="1"
      aria-label="Conversation"
    >
      <div className="ops-tray-head">
        <h2 className="ops-section-title">Conversation</h2>
      </div>
      <ol className="hub-enquiry-conversation-list">
        {messages!.map((row) => (
          <li
            key={row.id}
            className="hub-enquiry-conversation-row"
            data-sms-id={row.id}
            data-sms-direction={row.direction}
            data-sms-state={row.state}
          >
            <p className="hub-enquiry-conversation-meta">
              <span>{conversationDirectionLabel(row.direction)}</span>
              <span>{conversationMessageTime(row.at, timeZone)}</span>
              <span>{conversationStateLabel(row.state)}</span>
            </p>
            {row.body ? <p className="hub-enquiry-conversation-body">{row.body}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
