import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState } from '../../../types/IOfficeState'

type Payload = {
  client: Client
  money: number
  score: number
}

export default class PlayerUpdateInfoCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, money, score } = data

    const player = this.room.state.players.get(client.sessionId)

    if (!player) return
    player.money = money
    player.score = score
  }
}
