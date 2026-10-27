import { AppShell } from './components/AppShell'
import { ScreenContent } from './screens/Screens'
import { useAppStore } from './store/useAppStore'

function App() { const screen = useAppStore(state => state.screen); return <AppShell><ScreenContent screen={screen}/></AppShell> }
export default App
