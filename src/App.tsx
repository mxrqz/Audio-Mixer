import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api"
import { Slider } from "./components/ui/slider";
import { Slider2 } from "./components/ui/slider2";
import { appWindow, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faVolumeLow, faVolumeHigh, faCheck, faVolumeXmark } from '@fortawesome/free-solid-svg-icons'
import { register } from '@tauri-apps/api/globalShortcut';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeTextFile, BaseDirectory, exists, readTextFile } from '@tauri-apps/api/fs';
import { listen } from '@tauri-apps/api/event'
import { ScrollArea } from "./components/ui/scroll-area";

//fazer icone e função de mutar o audio faXMark

interface AppsInfo {
  name: string;
  volume: number;
  mutado: boolean;
}

interface Keybinds {
  name: string;
  command: string
}

export default function App() {
  const [apps, setApps] = useState<AppsInfo[]>([]);
  const [toggleDefault, setToggleDefault] = useState('master')
  const selectedApp = useRef<string>('master');
  const [animationTop, setAnimationTop] = useState('-translate-y-10');
  const [animationMiddle, setAnimationMiddle] = useState('');
  const [animationBottom, setAnimationBottom] = useState('translate-y-10')
  const [volume, setVolume] = useState<boolean>(false)
  const [keybinds, setKeybinds] = useState<Keybinds[]>([])
  const timeoutId = useRef<NodeJS.Timeout>()
  const stayVisible = useRef<boolean>(false)

  const appWindowConfigs = async () => {
    await appWindow.onFocusChanged(async ({ payload: focused }) => {
      if (focused == false) {
        appWindow.hide()
        stayVisible.current = false
      }
    });
  }

  const getApps = async () => {
    const apps = await invoke('get_apps')
      .then((response: any) => {
        const sessions: AppsInfo[] = JSON.parse(response).map((app: any) => ({
          name: app.name,
          volume: app.volume,
          mutado: false
        }));
        setApps(sessions);
        return sessions;
      });

    return apps;
  };

  const handleSelectedApp = (app: string) => {
    selectedApp.current = app;
    setToggleDefault(app)
  }

  const shortcutsKeybinds = [
    {
      "name": "VolumeUp",
      "command": "CommandOrControl+F9"
    },
    {
      "name": "VolumeDown",
      "command": "CommandOrControl+F8"
    },
    {
      "name": "Switch App Up",
      "command": "ArrowUp"
    },
    {
      "name": "Switch App Down",
      "command": "ArrowDown"
    },
  ]

  const verifyKeybind = async () => {
    try {
      const fileExists = await exists('keybinds.json', { dir: BaseDirectory.AppLocalData });
      if (!fileExists) {
        const dataString = JSON.stringify(shortcutsKeybinds);
        await writeTextFile('keybinds.json', dataString, { dir: BaseDirectory.AppLocalData });
      }
    } catch (error) {
      console.error('Erro ao verificar a existência do arquivo:', error);
    }
  }

  const fetchKeybinds = async () => {
    let fileFound = false;
    let attemptCount = 0;

    while (!fileFound && attemptCount < 30) {
      try {
        const data = await readTextFile('keybinds.json', { dir: BaseDirectory.AppLocalData });
        const parsedData = JSON.parse(data);
        // setKeybinds(parsedData);
        setKeybinds(parsedData)
        fileFound = true;
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!fileFound) {
      console.error('Arquivo não encontrado após 30 segundos.');
    }
  };

  const unlisten = async () => {
    await listen<string>('json-updated', () => {
      fetchKeybinds()
    });
  }

  const shortcuts = async () => {
    keybinds.map(async (keybind) => {
      await register(`${keybind.command}`, async () => {
        shortcut(`${keybind.name}`)
      })
    })
  }

  const shortcut = async (funcao: string) => {
    if (funcao === "VolumeUp") {
      await changeVolume(0.02, 2500)
    } else if (funcao === "VolumeDown") {
      await changeVolume(-0.02, 2500)
    } else if (funcao === "Switch App Up") {
      await switchApp('up', 2500)
    } else if (funcao === "Switch App Down") {
      await switchApp('down', 2500)
    }
  }

  const animationTimer = (direction: string) => {
    const animations = {
      "downTop": "transition-transform translate-y-0",
      "downMiddle": "transition-transform translate-y-10",
      "upMiddle": "transition-transform -translate-y-10",
      "upBottom": "transition-transform translate-y-0"
    }

    if (direction == 'up') {
      setAnimationMiddle(animations[`${direction}Middle`]);
      setAnimationBottom(animations[`${direction}Bottom`]);
    } else if (direction == 'down') {
      setAnimationTop(animations[`${direction}Top`])
      setAnimationMiddle(animations[`${direction}Middle`]);
    }
    setTimeout(() => {
      setAnimationTop('-translate-y-10');
      setAnimationMiddle('');
      setAnimationBottom('translate-y-10');
    }, 150);
  }

  const appSize = async (w: number, h: number) => {
    const size = new LogicalSize(w, h)
    await appWindow.setSize(size)
  }

  const appPosition = async (position: string) => {
    const monitor = await primaryMonitor();
    if (!monitor) {
      console.log('Monitor primário não encontrado');
      return;
    }

    const { width, height } = monitor.size;
    const windowWidth = window.innerWidth;
    let x, y;

    if (position === 'botton') {
      x = (width - windowWidth) / 2;
      y = height - 100;
    } else if (position === 'center') {
      const windowHeight = window.innerHeight;
      x = (width - windowWidth) / 2;
      y = (height - windowHeight) / 2;
    } else {
      console.log('Posição inválida');
      return;
    }

    const newPosition = new LogicalPosition(x, y);
    await appWindow.setPosition(newPosition);
  };

  const changeVolume = async (volume: number, timerDuration: number) => {
    // const volume = -0.02;
    const apps = await getApps()
    const app = apps.filter(app => app.name == selectedApp.current)
    await invoke('volume', { appName: app[0].name, volume });

    if (await appWindow.isVisible() === false) {
      await appSize(225, 40)
      await appPosition('botton')
      setVolume(true);
      await appWindow.setSkipTaskbar(true)
      await appWindow.show()
      await appWindow.setFocus()
    }

    await getApps()
    await timer(timerDuration)
  }

  const switchApp = async (direction: string, timerDuration: number) => {
    let apps = await getApps()
    apps.sort((a, b) => {
      if (a.name === "master") return -1;
      if (b.name === "master") return 1;
      return a.name.localeCompare(b.name);
    });

    const appIndex = apps.findIndex(app => app.name === selectedApp.current)
    if (direction === 'up') {
      if (appIndex !== 0) {
        const app = apps[appIndex - 1].name
        handleSelectedApp(app)
      } else if (appIndex === 0) {
        const app = apps[apps.length - 1].name
        handleSelectedApp(app)
      }
    } else if (direction === 'down') {
      if (appIndex !== apps.length - 1) {
        const app = apps[appIndex + 1].name
        handleSelectedApp(app)
      } else if (appIndex === apps.length - 1) {
        const app = apps[0].name
        handleSelectedApp(app)
      }
    }

    animationTimer(direction)

    if (await appWindow.isVisible() === false) {
      await appSize(225, 40)
      await appPosition('botton')
      setVolume(true);
      await appWindow.setSkipTaskbar(true)
      await appWindow.show()
      await appWindow.setFocus()
    }
    await timer(timerDuration)
  }

  const timer = async (duration: number) => {
    return new Promise((resolve) => {

      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }

      if (stayVisible.current === false) {
        timeoutId.current = setTimeout(async () => {
          const sucesso = true;
          await appWindow.hide();
          await appSize(500, 250);
          setVolume(false);
          resolve(sucesso);
        }, duration);
      }

    });
  };
  // timeoutId = undefined;

  const sliderValue = async (app: String, value: number[], timerDuration: number) => {
    await invoke('set_app_volume', { appName: app, volume: parseFloat(value.toString()) })
    updateAppVolume(app, parseFloat(value.toString()))
    await timer(timerDuration);
  }

  const updateAppVolume = (appName: String, newVolume: number) => {
    setApps(prevApps => prevApps.map(app => {
      if (app.name === appName) {
        return { ...app, volume: newVolume };
      }
      return app;
    }));
  };

  const getVolumeIcon = (volume: number) => {
    if (volume >= 0.5) {
      return <FontAwesomeIcon icon={faVolumeHigh} onClick={() => mute()} />
    } else if (volume < 0.5 && volume > 0) {
      return <FontAwesomeIcon icon={faVolumeLow} onClick={() => mute()} />
    } else if (volume === 0) {
      return <FontAwesomeIcon icon={faVolumeXmark} onClick={() => mute()} />
    }
  };

  const mute = async () => {
    setApps(prevApps => prevApps.map(app => {
      if (app.name === toggleDefault) {
        return { ...app, volume: 0, };
      }
      return app;
    }));
    await invoke('set_app_volume', { appName: toggleDefault, volume: 0 })
  };

  const getSlider = () => {
    const volume = apps.find(app => app.name === toggleDefault)?.volume
    if (volume) {
      return volume
    } else {
      return 0
    }
  }

  useEffect(() => {
    verifyKeybind();
    fetchKeybinds();

    getApps();
    shortcuts();
    appWindowConfigs();
    unlisten();
  }, []);

  useEffect(() => {
    shortcuts();
  }, [keybinds, fetchKeybinds]);

  //fazer a função de mutar o app e salvar o volume anterior para qndo desmutar voltar no valor antigo

  return (
    <>
      {volume ? (
        <div className="text-white h-screen w-full relative items-center justify-center flex flex-col"
          onMouseEnter={() => { stayVisible.current = true; clearTimeout(timeoutId.current); }}
          onMouseLeave={async () => { stayVisible.current = false; await timer(2500); }}
          onWheel={async (event) => { event.deltaY > 0 ? await changeVolume(-0.02, 2500) : await changeVolume(0.02, 2500) }}
        >
          <div className="w-full h-full relative">
            <div className={`absolute w-full h-full flex items-center justify-center ${animationTop}`}>
              <div className="w-full px-3 gap-1 grid grid-cols-[25px,1fr,25px] items-center justify-between text-center relative">
                {getVolumeIcon(getSlider())}
                <Slider2 max={1} step={0.01}
                  value={[getSlider()]}
                />
                <span>{(getSlider() * 100).toFixed(0)}</span>
              </div>

              <span className="text-sm absolute bottom-0 w-fit h-fit text-center -z-10">{toggleDefault.slice(0, 1).toUpperCase()}{toggleDefault.slice(1)}</span>
            </div>

            <div className={`absolute w-full h-full flex items-center justify-center ${animationMiddle}`}>
              <div className="w-full px-3 gap-1 grid grid-cols-[25px,1fr,25px] items-center justify-between text-center relative">
                {getVolumeIcon(getSlider())}
                <Slider2 max={1}
                  value={[getSlider()]} step={0.01}
                  onValueChange={async (value) => await sliderValue(toggleDefault, value, 2500)}
                />
                <span>{(getSlider() * 100).toFixed(0)}</span>
              </div>

              <span className="text-sm absolute bottom-0 w-fit h-fit text-center -z-10">{toggleDefault.slice(0, 1).toUpperCase()}{toggleDefault.slice(1)}</span>
            </div>

            <div className={`absolute w-full h-full flex items-center justify-center ${animationBottom}`}>
              <div className="w-full px-3 gap-1 grid grid-cols-[25px,1fr,25px] items-center justify-between text-center relative">
                {getVolumeIcon(getSlider())}
                <Slider2 max={1}
                  value={[getSlider()]} step={0.01}
                />
                <span>{(getSlider() * 100).toFixed(0)}</span>
              </div>

              <span className="text-sm absolute bottom-0 w-fit h-fit text-center -z-10">{toggleDefault.slice(0, 1).toUpperCase()}{toggleDefault.slice(1)}</span>
            </div>

          </div>

          <div id="noise" className="absolute left-0 top-0 w-full h-full"></div>
        </div>
      ) : (
        <ScrollArea className="h-full w-full">
          <div className="w-full">

            <ToggleGroup type="single" className="flex flex-col gap-2 w-full text-white"
              value={toggleDefault} onValueChange={
                (value: string) => handleSelectedApp(value)
              }>

              {[
                ...apps.filter(app => app.name === "master"),
                ...apps.filter(app => app.name !== "master").sort((a, b) => a.name.localeCompare(b.name))
              ].map((app, index) => (
                <section key={index} className="flex gap-5 items-center justify-between rounded-lg bg-primary/20 border border-[#3b3b3b] hover:bg-primary/30 w-full py-2">
                  <div className="grid grid-cols-[35px,35px,125px] items-center gap-2 w-full pl-5"
                    onClick={() => handleSelectedApp(app.name)}
                  >
                    <ToggleGroupItem value={app.name} className="border border-primary/30 ">
                      <FontAwesomeIcon icon={faCheck} />
                    </ToggleGroupItem>

                    <div className="flex justify-center">
                      <img src={`https://raw.githubusercontent.com/mxrqz/icons/main/${app.name.toLowerCase()}.png`}
                        alt={`${app.name} icon`} className="w-3/4 rounded-md"
                      />
                    </div>


                    <span>{app.name.slice(0, 1).toUpperCase()}{app.name.slice(1)}</span>
                  </div>

                  <div className="w-2/3 h-full grid grid-cols-[15px,25px,1fr] gap-4 pr-5 items-center text-end">
                    {getVolumeIcon(app.volume)}
                    <span>{(app.volume * 100).toFixed(0)}</span>
                    <Slider max={1} defaultValue={[app.volume]} value={[app.volume]} step={0.01} onValueChange={async (value) => { sliderValue(app.name, value, 2500); stayVisible.current = true }} />
                  </div>

                </section>
              ))}

            </ToggleGroup>


            <div id="noise" className="absolute left-0 top-0 w-full h-full"></div>
          </div >
        </ScrollArea >
      )
      }
    </>


  );
}