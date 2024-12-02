import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState, IPlayer } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'

type Payload = {
  client: Client
  timeUntilNextQuiz: number       // 현재 퀴즈 남은 시간
  remainingTime: number           // 참가 가능한 시간
}

export default class QuizRequestCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, timeUntilNextQuiz, remainingTime } = data
    const participantsCount = this.state.quizParticipants.size;
    const player: IPlayer | undefined = this.state.players.get(client.sessionId);
    let playerName = 'Unknown Player';
    if (player) {
      playerName = player.name; // 플레이어의 이름을 가져옴
    }
    const participantNames: string[] = [];
    this.state.quizParticipants.forEach(participantId => {
      const participant = this.state.players.get(participantId);
      participantNames.push(participant ? participant.name : 'Unknown Player');
    });

    this.room.broadcast(Message.PLAYER_JOIN_QUIZ, {
      playerName: playerName,
      participantsCount: participantsCount,
      existingParticipants: participantNames,
    })
    if (!this.state.quizInProgress) {
      // 현재 퀴즈에 참여 가능
      client.send(Message.JOIN_QUIZ, {
        remainingTime: remainingTime,
      })
    } else {
      // 다음 퀴즈에 참여하도록 안내
      client.send(Message.WAIT_FOR_NEXT_QUIZ, {
        timeUntilNextQuiz: timeUntilNextQuiz,
      })
    }
  }
}
