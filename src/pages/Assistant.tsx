import { ChatView } from '../components/Chat'
import { Reveal } from '../components/ui'
import { GENERAL_SUGGESTIONS } from '../lib/agents'

export default function Assistant() {
  return (
    <Reveal className="h-[calc(100dvh-12.5rem)] md:h-[calc(100dvh-7.5rem)]">
      <ChatView kind={null} title="IA da Scalable" subtitle="Online · sua assistente de gestão" suggestions={GENERAL_SUGGESTIONS} />
    </Reveal>
  )
}
