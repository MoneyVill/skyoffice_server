import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'
import QuizRequestCommand from './commands/QuizRequestCommand'
import QuizLeaveCommand from './commands/QuizLeaveCommand'

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  private password: string | null = null
  private quizInProgress: boolean = false;
  private quizTimer: NodeJS.Timeout | null = null;
  private currentQuestionNumber: number = 0;
  private quizTimerStart: number | null = null;
  private quizTimerDuration: number | null = null;
  private prequizTimer: NodeJS.Timeout | null = null;
  private prequizTimerStart: number | null = null;
  private prequizTimerDuration: number | null = null;

  async onCreate(options: IRoomData) {
    const { name, description, password, autoDispose } = options
    this.name = name
    this.description = description
    this.autoDispose = autoDispose

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.setState(new OfficeState())
    // 퀴즈 관리 로직 초기화
    this.initializeQuiz();
    
    // HARD-CODED: Add 5 computers in a room
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    // HARD-CODED: Add 4 whiteboards in a room
    for (let i = 0; i < 4; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    // when a player connect to a computer, add to the computer connectedUser array
    this.onMessage(Message.CONNECT_TO_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerAddUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player disconnect from a computer, remove from the computer connectedUser array
    this.onMessage(Message.DISCONNECT_FROM_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerRemoveUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player stop sharing screen
    this.onMessage(Message.STOP_SCREEN_SHARE, (client, message: { computerId: string }) => {
      const computer = this.state.computers.get(message.computerId)
      computer.connectedUser.forEach((id) => {
        this.clients.forEach((cli) => {
          if (cli.sessionId === id && cli.sessionId !== client.sessionId) {
            cli.send(Message.STOP_SCREEN_SHARE, client.sessionId)
          }
        })
      })
    })

    // when a player connect to a whiteboard, add to the whiteboard connectedUser array
    this.onMessage(Message.CONNECT_TO_WHITEBOARD, (client, message: { whiteboardId: string }) => {
      this.dispatcher.dispatch(new WhiteboardAddUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    // when a player disconnect from a whiteboard, remove from the whiteboard connectedUser array
    this.onMessage(
      Message.DISCONNECT_FROM_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), {
          client,
          whiteboardId: message.whiteboardId,
        })
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateCommand
    this.onMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        this.dispatcher.dispatch(new PlayerUpdateCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.videoConnected = true
    })

    // when a player disconnect a stream, broadcast the signal to the other player connected to the stream
    this.onMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => {
      this.clients.forEach((cli) => {
        if (cli.sessionId === message.clientId) {
          cli.send(Message.DISCONNECT_STREAM, client.sessionId)
        }
      })
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    // 클라이언트의 퀴즈 참여 요청 처리
    this.onMessage(Message.REQUEST_QUIZ, (client) => {
      this.dispatcher.dispatch(new QuizRequestCommand(), {
        client,
        quizInProgress: this.quizInProgress,
        currentQuestionNumber: this.currentQuestionNumber,
        timeUntilNextQuiz: this.getQuizRemainingTime(),
        remainingTime: this.getPreQuizRemainingTime(),
      })
    })

    // 클라이언트의 퀴즈 나가기 요청 처리
    this.onMessage(Message.LEAVE_QUIZ, (client) => {
      this.dispatcher.dispatch(new QuizLeaveCommand(), {
        client,
      });
    });

  }
    
  // 퀴즈 관리 로직
  initializeQuiz() {
    // 첫 퀴즈 시작준비
    this.readyQuiz();
  }
  
  startQuiz() {
    this.quizInProgress = true;
  
    // 타이머 시작 시간 및 지속 시간 설정
    this.quizTimerStart = Date.now();
    this.quizTimerDuration = 10000; // 밀리초 단위
  
    // 모든 클라이언트에게 퀴즈 시작 메시지 전송
    this.broadcast(Message.START_QUIZ, {
      curQuiz: this.currentQuestionNumber,
      quizTime: this.quizTimerDuration,
    });
  
    // 10초 후에 퀴즈 종료
    this.quizTimer = setTimeout(() => {
      this.endQuiz();
    }, this.quizTimerDuration);
  }

  endQuiz() {
    this.quizInProgress = false;

    // 퀴즈 종료 메시지 전송 (필요하다면)
    this.broadcast(Message.END_QUIZ);
    this.readyQuiz()
  }
  
  readyQuiz() {
    this.currentQuestionNumber = this.getQuizQuestionNumber();
    // 타이머 시작 시간 및 지속 시간 설정
    this.prequizTimerStart = Date.now();
    this.prequizTimerDuration = 3000; // 밀리초 단위

    this.prequizTimer = setTimeout(() => {
      this.startQuiz();
    }, this.prequizTimerDuration);
  }

  getQuizRemainingTime() {
    // 현재 시간과 퀴즈 종료 시간의 차이 계산
    if (this.quizTimerStart !== null && this.quizTimerDuration !== null) {
      const elapsed = Date.now() - this.quizTimerStart;
      const remaining = this.quizTimerDuration - elapsed;
      const remainingSeconds = remaining / 1000;

      return remainingSeconds > 0 ? remainingSeconds : 0;
    }
    return 0;
  }

  getPreQuizRemainingTime() {
    if (this.prequizTimerStart !== null && this.prequizTimerDuration !== null) {
      const elapsed = Date.now() - this.prequizTimerStart;
      const remaining = this.prequizTimerDuration - elapsed;
      const remainingSeconds = remaining / 1000;

      return remainingSeconds > 0 ? remainingSeconds : 0;
    }
    return 0;
  }

  getQuizQuestionNumber() {
    // 문제 번호 선택 로직 (랜덤 또는 순차적으로)
    // 예시: 1부터 10까지의 랜덤 숫자
    return Math.floor(Math.random() * 3) + 1;
  }

  async onAuth(client: Client, options: { password: string | null }) {
    if (this.password) {
      const validPassword = await bcrypt.compare(options.password, this.password)
      if (!validPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    return true
  }

  onJoin(client: Client, options: any) {
    this.state.players.set(client.sessionId, new Player())
    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
    })
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
    this.state.computers.forEach((computer) => {
      if (computer.connectedUser.has(client.sessionId)) {
        computer.connectedUser.delete(client.sessionId)
      }
    })
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboard.connectedUser.has(client.sessionId)) {
        whiteboard.connectedUser.delete(client.sessionId)
      }
    })
  }

  onDispose() {
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboardRoomIds.has(whiteboard.roomId)) whiteboardRoomIds.delete(whiteboard.roomId)
    })

    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
