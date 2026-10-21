// Classic script: PHRASES is shared with renderer.ts. Lines she says on her own.
interface Phrase {
  text: string;
  mood?: "happy" | "neutral" | "thinking" | "sad" | "surprised" | "shy";
}

const PHRASES: Record<string, Phrase[]> = {
  greetMorning: [
    { text: "Доброе утро! Кофе уже был? У меня ноутбук и куча идей.", mood: "happy" },
    { text: "Утро! Давай сделаем сегодня что-нибудь полезное.", mood: "happy" },
  ],
  greetDay: [
    { text: "Привет! Я на месте. Что делаем?", mood: "happy" },
    { text: "О, ты вернулся! Я тут скучала по твоим задачам.", mood: "happy" },
  ],
  greetEvening: [
    { text: "Добрый вечер! Ещё поработаем или уже отдыхать?", mood: "happy" },
    { text: "Вечер. Самое время разобрать бардак в папках.", mood: "neutral" },
  ],
  greetNight: [
    { text: "Ты ещё не спишь? Я тоже... Но завтра ты пожалеешь.", mood: "shy" },
    { text: "Ночная смена? Ладно, я с тобой. Но недолго!", mood: "neutral" },
  ],
  // she is poked: the input opens right after
  listen: [
    { text: "Слушаю!", mood: "happy" },
    { text: "Что делаем?", mood: "happy" },
    { text: "Я вся внимание.", mood: "neutral" },
    { text: "Ага? Что нужно?", mood: "surprised" },
    { text: "Давай, диктуй.", mood: "happy" },
  ],
  hover: [
    { text: "Эй, чего уставился? Нажми, если что-то нужно.", mood: "shy" },
    { text: "Щекотно!", mood: "surprised" },
    { text: "Я тут, никуда не убегаю. Ну... почти.", mood: "shy" },
  ],
  idle: [
    { text: "Если что-то сломалось, виноват Wayland.", mood: "neutral" },
    { text: "Ты когда последний раз делал коммит?", mood: "thinking" },
    { text: "Тихо... слишком тихо. Подозрительно.", mood: "surprised" },
    { text: "Если застрянешь на баге, расскажи мне. Я не осуждаю.", mood: "happy" },
    { text: "Сколько у тебя открыто вкладок? Только честно.", mood: "thinking" },
    { text: "Мне нравится этот рабочий стол. Только места маловато.", mood: "neutral" },
    { text: "Пять минут перерыва ещё никому не вредили.", mood: "happy" },
    { text: "Я тут просто гуляю. Не обращай внимания.", mood: "shy" },
  ],
  nudge: [
    { text: "Ты сидишь уже давно! Встань, потянись, попей воды.", mood: "happy" },
    { text: "Глаза не болят? Посмотри в окно секунд двадцать.", mood: "thinking" },
  ],
  lateNight: [
    { text: "Уже за полночь... Может, остальное доделаем завтра?", mood: "sad" },
  ],
};
