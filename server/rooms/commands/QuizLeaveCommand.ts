// commands/QuizLeaveCommand.ts

import { Command } from '@colyseus/command';
import { Client } from 'colyseus';
import { IOfficeState, IPlayer } from '../../../types/IOfficeState';
import { Message } from '../../../types/Messages'

type Payload = {
  client: Client;
};

export default class QuizLeaveCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client } = data
    const player: IPlayer | undefined = this.state.players.get(client.sessionId);
    let playerName = 'Unknown Player';
    if (player) {
      playerName = player.name; // 플레이어의 이름을 가져옴
    }
    const participants: string[] = []; // 일반 배열로 변환
    this.state.quizParticipants.forEach((id) => participants.push(id));
    // 모든 클라이언트에게 퀴즈 참여자 정보 업데이트 브로드캐스트
    this.room.broadcast(Message.PLAYER_LEFT_QUIZ, {
      playerName: playerName, // 나간 플레이어 ID
    });
    // 해당 클라이언트에 퀴즈 나가기 메시지 전송
    client.send(Message.LEFT_QUIZ)

  }
}