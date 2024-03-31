import { useEffect, useState } from "react";
// import { invoke } from "@tauri-apps/api"
import { appWindow } from "@tauri-apps/api/window";
import { unregisterAll } from '@tauri-apps/api/globalShortcut';
import { writeTextFile, BaseDirectory, readTextFile } from '@tauri-apps/api/fs';
import { ScrollArea } from "./components/ui/scroll-area";
import { Input } from "./components/ui/input";
import { emit } from '@tauri-apps/api/event'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faVolumeLow, faVolumeHigh, faChevronUp, faChevronDown, faCircleStop } from '@fortawesome/free-solid-svg-icons'

// interface AppsInfo {
//     name: string;
//     volume: number;
// }

interface Keybinds {
    name: string;
    command: string
}

export default function Control() {
    // const [apps, setApps] = useState<AppsInfo[]>([]);

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

    const appWindowConfigs = async () => {
        await appWindow.onFocusChanged(async ({ payload: focused }) => {
            if (focused == false) {
                appWindow.hide()
            }
        });
    }

    // const getApps = async () => {
    //     const apps = await invoke('get_apps')
    //         .then((response: any) => {
    //             const sessions: AppsInfo[] = JSON.parse(response);
    //             setApps(sessions);
    //             return sessions
    //         });

    //     return apps
    // };

    const [keybinds, setKeybinds] = useState<Keybinds[]>([])
    const [currentKey, setCurrentKey] = useState<string>('')
    const [teste, setTeste] = useState<string[]>([])

    const keydown = async (name: string, command: string) => {
        if (command !== currentKey) {
            teste.push(command)
            const index = keybinds.findIndex(keybind => keybind.name === name);
            const newKeybinds = [...keybinds];
            const newCommand = teste.join("+")
            newKeybinds[index] = { name, command: newCommand };
            setKeybinds(newKeybinds);
            setCurrentKey(command);
            const dataString = JSON.stringify(newKeybinds)
            await writeTextFile('keybinds.json', dataString, { dir: BaseDirectory.AppLocalData });
        }
    };

    const inputs = () => {
        const input = document.querySelectorAll('input');
        input.forEach(input => {
            input.blur()
        })
    }

    const keyup = () => {
        setCurrentKey('');
        setTeste([]);
        unregisterKeybinds();
        inputs();
    }

    const unregisterKeybinds = async () => {
        await unregisterAll();
        await emit('json-updated');
        // await invoke('json_update')
    }

    useEffect(() => {
        // getApps();
        appWindowConfigs();
        fetchKeybinds();
    }, []);

    const getIcon = (keybind: string) => {
        if (keybind === 'VolumeUp') {
            return <FontAwesomeIcon icon={faVolumeHigh} />
        } else if (keybind === 'VolumeDown') {
            return <FontAwesomeIcon icon={faVolumeLow} />
        } else if (keybind === 'Switch App Up') {
            return <FontAwesomeIcon icon={faChevronUp} />
        } else if (keybind === 'Switch App Down') {
            return <FontAwesomeIcon icon={faChevronDown} />
        }
    }

    const [inputClickedIndex, setInputClickedIndex] = useState<number | null>(null);

    return (
        <ScrollArea className="w-full h-full">
            <div className="flex flex-col gap-2 text-white">

                {/* {[
                    ...apps.filter(app => app.name === "master"),
                    ...apps.filter(app => app.name !== "master").sort((a, b) => a.name.localeCompare(b.name))
                ].map((app, index) => (
                    <div key={index} className="flex items-center justify-between py-2 px-4 bg-primary/20 border border-[#3b3b3b] hover:bg-primary/30 rounded-lg">
                        <div className="flex gap-2 items-center">
                            <img className="rounded-sm h-8 aspect-square" src={`https://raw.githubusercontent.com/mxrqz/icons/main/${app.name.toLowerCase()}.png`} alt="" />
                            <span>{app.name.slice(0, 1).toUpperCase()}{app.name.slice(1)}</span>
                        </div>

                        <Input className="bg-zinc-700 rounded-md py-1 px-2 w-1/2 no-underline" />
                    </div>
                ))} */}

                <div className="flex flex-col gap-2">
                    {keybinds.map((keybind, index) => (
                        <div key={index} className="bg-primary/20 border border-[#3b3b3b] hover:bg-primary/30 rounded-lg py-2 px-4 flex justify-between text-center items-center">
                            <div className="flex gap-2 items-center">
                                {getIcon(keybind.name)}
                                <span>{keybind.name}</span>
                            </div>

                            <div className="flex items-center relative">
                                <Input className={`bg-zinc-700 rounded-md py-1 px-2  no-underline w-full
                                    focus-visible:ring-0 focus-visible:animate-pulse focus-visible:border-red-500
                                `}
                                    onClick={() => setInputClickedIndex(index)}
                                    onBlur={() => setInputClickedIndex(null)}
                                    value={keybind.command}
                                    onKeyDown={(event) => keydown(keybind.name, event.key)}
                                    onKeyUp={keyup}
                                    readOnly
                                />

                                {inputClickedIndex === index && (
                                    <FontAwesomeIcon icon={faCircleStop} className="absolute right-2 animate-pulse text-red-500" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div id="noise" className="absolute left-0 top-0 w-full h-full"></div>
            </div>
        </ScrollArea>
    )
}