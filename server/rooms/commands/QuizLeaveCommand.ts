// commands/QuizLeaveCommand.ts

import { Command } from '@colyseus/command';
import { Client } from 'colyseus';
import { IOfficeState } from '../../../types/IOfficeState';
import { Message } from '../../../types/Messages'

type Payload = {
  client: Client;
};

export default class QuizLeaveCommand extends Command<IOfficeState, Payload> {
  execute({ client }: Payload) {
    // 퀴즈에서 해당 사용자를 제거하는 로직을 구현합니다.
    // 예를 들어, 퀴즈 참가자 목록에서 제거하거나 상태를 업데이트합니다.
  
    client.send(Message.LEFT_QUIZ, {
    })
    // 필요하다면 다른 클라이언트에게 해당 사용자가 퀴즈에서 나갔음을 알릴 수 있습니다.
    // this.room.broadcast(Message.PLAYER_LEFT_QUIZ, { clientId: client.sessionId });
  }
}