import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'

type Payload = {
  client: Client
  quizInProgress: boolean
  currentQuestionNumber: number
  timeUntilNextQuiz: number       // 현재 퀴즈 남은 시간
  remainingTime: number           // 참가 가능한 시간
}

export default class QuizRequestCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, quizInProgress, currentQuestionNumber, timeUntilNextQuiz, remainingTime } = data

    if (!quizInProgress) {
      // 현재 퀴즈에 참여 가능
      client.send(Message.PLAYER_JOIN_QUIZ, {
        questionNumber: currentQuestionNumber,
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
