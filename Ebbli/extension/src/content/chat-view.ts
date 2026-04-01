/**
 * Ebbli - Chat view helpers
 */

const TURN_SELECTOR = [
  '[data-testid="conversation-turn"]',
  '[data-message-id]',
  '[data-message-author-role]',
  'article',
].join(',')

export function hasConversationTurns(root: ParentNode): boolean {
  return !!root.querySelector(TURN_SELECTOR)
}

export function isEmptyChatView(root: ParentNode): boolean {
  const main = root.querySelector('main')
  if (!main) {
    return false
  }

  return !hasConversationTurns(main)
}