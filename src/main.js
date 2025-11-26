/**
 * GoScript - Main Integration Script
 * Orchestrates the complete system initialization and execution
 */

// Example programs stored in VFS
const EXAMPLE_PROGRAMS = {
    '/examples/hello/main.go': `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    fmt.Println("Welcome to GoScript - Go in your browser!")
}`,

    '/examples/fibonacci/main.go': `package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    fmt.Println("Fibonacci Sequence:")
    for i := 0; i < 15; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fibonacci(i))
    }
}`,

    '/examples/fizzbuzz/main.go': `package main

import "fmt"

func main() {
    fmt.Println("FizzBuzz from 1 to 30:")
    fmt.Println()
    
    for i := 1; i <= 30; i++ {
        switch {
        case i%15 == 0:
            fmt.Println("FizzBuzz")
        case i%3 == 0:
            fmt.Println("Fizz")
        case i%5 == 0:
            fmt.Println("Buzz")
        default:
            fmt.Println(i)
        }
    }
}`,

    '/examples/primes/main.go': `package main

import "fmt"

func isPrime(n int) bool {
    if n < 2 {
        return false
    }
    for i := 2; i*i <= n; i++ {
        if n%i == 0 {
            return false
        }
    }
    return true
}

func main() {
    fmt.Println("Prime numbers from 1 to 100:")
    fmt.Println()
    
    count := 0
    for i := 1; i <= 100; i++ {
        if isPrime(i) {
            fmt.Printf("%4d ", i)
            count++
            if count%10 == 0 {
                fmt.Println()
            }
        }
    }
    fmt.Printf("\\n\\nFound %d prime numbers.\\n", count)
}`,

    '/examples/structs/main.go': `package main

import "fmt"

type Person struct {
    Name string
    Age  int
    City string
}

func (p Person) Greet() string {
    return fmt.Sprintf("Hi, I'm %s, %d years old from %s!", p.Name, p.Age, p.City)
}

func main() {
    people := []Person{
        {Name: "Alice", Age: 30, City: "New York"},
        {Name: "Bob", Age: 25, City: "San Francisco"},
        {Name: "Charlie", Age: 35, City: "Seattle"},
    }
    
    fmt.Println("Meet our team:")
    fmt.Println()
    
    for _, person := range people {
        fmt.Println(person.Greet())
    }
}`
};

class PersonalWebsite2025 {
    constructor() {
        this.modules = {
            gitHubFetcher: null,
            vfs: null,
            cacheManager: null,
            compilationManager: null,
            appRunner: null
        };
        
        this.state = {
            initialized: false,
            compiling: false,
            compiled: false,
            running: false,
            compiledWasmBinary: null,
            lastSourceCode: null
        };
        
        this.ui = {
            updateProgress: null,
            updateProgressText: null,
            setStageStatus: null,
            addConsoleOutput: null,
            showReadyState: null,
            showError: null
        };

        // Editor state
        this.openTabs = [];
        this.activeTab = null;
        this.currentDir = '/';
        this.editor = null;  // CodeMirror instance
        this.tabModified = new Map();  // Track modified state per tab
        this.tabContent = new Map();   // Store content for each tab
    }

    /**
     * Initialize the complete system
     * @param {Object} uiCallbacks - UI callback functions
     */
    async init(uiCallbacks) {
        try {
            this.ui = uiCallbacks;
            
            this.ui.addConsoleOutput('🚀 GoScript: System initialization started');
            
            // Initialize CodeMirror editor
            this.initEditor();
            
            // Initialize all modules
            await this.initializeModules();
            
            // Load example programs into VFS
            this.loadExamplePrograms();
            
            // Open all example files in editor tabs
            this.openAllExampleTabs();
            
            // Configure output redirection
            this.modules.appRunner.configureOutput((text) => {
                this.ui.addConsoleOutput(text, true);
            });
            
            // Set up module interconnections
            this.wireModules();
            
            this.setupTerminal();
            this.setupEditorButtons();
            
            this.state.initialized = true;
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('✅ GoScript: System ready!');
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('📁 Example programs available in /examples:');
            this.ui.addConsoleOutput('   • /examples/hello      - Hello World');
            this.ui.addConsoleOutput('   • /examples/fibonacci  - Fibonacci sequence');
            this.ui.addConsoleOutput('   • /examples/fizzbuzz   - FizzBuzz challenge');
            this.ui.addConsoleOutput('   • /examples/primes     - Prime numbers');
            this.ui.addConsoleOutput('   • /examples/structs    - Go structs & methods');
            this.ui.addConsoleOutput('');
            this.ui.addConsoleOutput('💡 Try: cd /examples/hello && cat main.go && go run main.go');
            
        } catch (error) {
            this.ui.addConsoleOutput(`❌ GoScript: Initialization failed - ${error.message}`);
            this.ui.showError(error.message);
            throw error;
        }
    }

    /**
     * Initialize CodeMirror editor
     * @private
     */
    initEditor() {
        const textarea = document.getElementById('code-editor');
        this.editor = CodeMirror.fromTextArea(textarea, {
            mode: 'go',
            theme: 'dracula',
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: true,
            lineWrapping: false,
            extraKeys: {
                'Ctrl-Z': () => this.editor.undo(),
                'Ctrl-Y': () => this.editor.redo(),
                'Ctrl-Shift-Z': () => this.editor.redo(),
                'Ctrl-S': (cm) => {
                    this.saveCurrentFile();
                    return false;
                }
            }
        });
        
        // Track changes
        this.editor.on('change', () => {
            if (this.activeTab) {
                this.tabModified.set(this.activeTab, true);
                this.renderTabs();
            }
        });
        
        // Set initial placeholder
        this.editor.setValue('// Select a file from /examples to get started\n// Try: cd /examples/hello && cat main.go');
    }

    /**
     * Setup editor buttons
     * @private
     */
    setupEditorButtons() {
        document.getElementById('undo-btn')?.addEventListener('click', () => {
            this.editor.undo();
        });
        
        document.getElementById('redo-btn')?.addEventListener('click', () => {
            this.editor.redo();
        });
        
        document.getElementById('save-btn')?.addEventListener('click', () => {
            this.saveCurrentFile();
        });
    }

    /**
     * Save the current file to VFS
     */
    saveCurrentFile() {
        if (!this.activeTab) {
            this.ui.addConsoleOutput('No file open to save');
            return;
        }
        
        const content = this.editor.getValue();
        this.modules.vfs.writeFile(this.activeTab, content);
        this.tabModified.set(this.activeTab, false);
        this.tabContent.set(this.activeTab, content);
        this.renderTabs();
        this.ui.addConsoleOutput(`💾 Saved: ${this.activeTab}`);
    }

    /**
     * Load example programs into VFS
     * @private
     */
    loadExamplePrograms() {
        const vfs = this.modules.vfs;
        
        // Create example directories
        vfs.mkdir('/examples');
        vfs.mkdir('/examples/hello');
        vfs.mkdir('/examples/fibonacci');
        vfs.mkdir('/examples/fizzbuzz');
        vfs.mkdir('/examples/primes');
        vfs.mkdir('/examples/structs');
        
        // Write all example files
        for (const [path, content] of Object.entries(EXAMPLE_PROGRAMS)) {
            vfs.writeFile(path, content);
        }
        
        this.ui.addConsoleOutput('📦 GoScript: Loaded 5 example programs');
    }

    /**
     * Open all example files as tabs in the editor
     * @private
     */
    openAllExampleTabs() {
        const exampleFiles = [
            '/examples/hello/main.go',
            '/examples/fibonacci/main.go',
            '/examples/fizzbuzz/main.go',
            '/examples/primes/main.go',
            '/examples/structs/main.go'
        ];
        
        const vfs = this.modules.vfs;
        
        for (const filePath of exampleFiles) {
            if (vfs.exists(filePath)) {
                let content = vfs.readFile(filePath);
                if (content instanceof Uint8Array) {
                    content = new TextDecoder().decode(content);
                }
                
                this.openTabs.push(filePath);
                this.tabContent.set(filePath, content);
                this.tabModified.set(filePath, false);
            }
        }
        
        // Set hello as active tab and load its content
        if (this.openTabs.length > 0) {
            this.activeTab = this.openTabs[0];
            this.editor.setValue(this.tabContent.get(this.activeTab));
            this.editor.clearHistory();
        }
        
        this.renderTabs();
    }

    /**
     * Handle tab completion for terminal
     * @param {HTMLInputElement} input - Terminal input element
     * @private
     */
    handleTabCompletion(input) {
        const value = input.value;
        const cursorPos = input.selectionStart;
        
        // Get the word being completed (from last space to cursor)
        const beforeCursor = value.substring(0, cursorPos);
        const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
        const wordStart = lastSpaceIndex + 1;
        const partial = beforeCursor.substring(wordStart);
        
        if (!partial) return;
        
        const vfs = this.modules.vfs;
        let completions = [];
        
        // Check if it looks like a path
        if (partial.includes('/') || partial.startsWith('.')) {
            // Path completion
            let dirPath, filePrefix;
            
            if (partial.endsWith('/')) {
                dirPath = this.resolvePath(partial);
                filePrefix = '';
            } else {
                const lastSlash = partial.lastIndexOf('/');
                if (lastSlash >= 0) {
                    dirPath = this.resolvePath(partial.substring(0, lastSlash + 1));
                    filePrefix = partial.substring(lastSlash + 1);
                } else {
                    dirPath = this.currentDir;
                    filePrefix = partial;
                }
            }
            
            // Get directory contents
            const contents = vfs.readDir(dirPath);
            if (contents) {
                completions = contents
                    .filter(name => name.toLowerCase().startsWith(filePrefix.toLowerCase()))
                    .map(name => {
                        const fullPath = dirPath + (dirPath.endsWith('/') ? '' : '/') + name;
                        const isDir = vfs.isDirectory(fullPath);
                        return partial.substring(0, partial.lastIndexOf('/') + 1) + name + (isDir ? '/' : '');
                    });
            }
        } else {
            // Command completion
            const commands = ['cd', 'ls', 'cat', 'pwd', 'clear', 'help', 'history', 'exit', 'go', 'tree', 'echo'];
            completions = commands.filter(cmd => cmd.startsWith(partial.toLowerCase()));
        }
        
        if (completions.length === 1) {
            // Single match - complete it
            const afterCursor = value.substring(cursorPos);
            input.value = value.substring(0, wordStart) + completions[0] + afterCursor;
            input.selectionStart = input.selectionEnd = wordStart + completions[0].length;
        } else if (completions.length > 1) {
            // Multiple matches - show them and complete common prefix
            this.ui.addConsoleOutput(completions.join('  '));
            
            // Find common prefix
            let commonPrefix = completions[0];
            for (const c of completions) {
                while (!c.startsWith(commonPrefix)) {
                    commonPrefix = commonPrefix.slice(0, -1);
                }
            }
            
            if (commonPrefix.length > partial.length) {
                const afterCursor = value.substring(cursorPos);
                input.value = value.substring(0, wordStart) + commonPrefix + afterCursor;
                input.selectionStart = input.selectionEnd = wordStart + commonPrefix.length;
            }
        }
    }

    /**
     * Resolve a path relative to current directory
     * @param {string} path - Path to resolve
     * @returns {string} Absolute path
     * @private
     */
    resolvePath(path) {
        if (path.startsWith('/')) return path;
        if (path === '.') return this.currentDir;
        if (path === '..') {
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/');
        }
        if (path.startsWith('./')) path = path.substring(2);
        if (path.startsWith('../')) {
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/') + '/' + path.substring(3);
        }
        return this.currentDir + (this.currentDir.endsWith('/') ? '' : '/') + path;
    }

    /**
     * Initialize all system modules
     * @private
     */
    async initializeModules() {
        this.ui.addConsoleOutput('🔧 GoScript: Creating module instances...');
        
        // Create all modules
        this.modules.gitHubFetcher = new GitHubFetcher();
        this.modules.vfs = new VirtualFileSystem();
        this.modules.cacheManager = new CacheManager();
        this.modules.appRunner = new AppRunner();
        
        // Initialize async modules
        await this.modules.cacheManager.init();
        await this.modules.appRunner.init();
        
        // Create compilation manager
        this.modules.compilationManager = new CompilationManager();
        this.modules.compilationManager.init(this.modules.vfs, this.modules.cacheManager);
        
        this.ui.addConsoleOutput('✅ GoScript: All modules created successfully');
    }

    /**
     * Wire modules together with callbacks
     * @private
     */
    wireModules() {
        this.ui.addConsoleOutput('🔗 GoScript: Wiring module callbacks...');
        
        // Set up compilation manager callbacks
        this.modules.compilationManager.setCallbacks({
            onProgress: (percentage, status) => {
                // this.ui.addConsoleOutput(`📊 PROGRESS: ${percentage}% - ${status}`);
            },
            
            onStageUpdate: (stage, status) => {
                const stageNames = [
                    '', 'Compiler Load', 'Cache Check', 'Source Fetch', 
                    'VFS Setup', 'Go Compile', 'Binary Cache', 'Prep Exec'
                ];
                if (status === 'active') {
                    this.ui.addConsoleOutput(`🎯 ${stageNames[stage]}...`);
                }
            },
            
            onError: (message) => {
                this.ui.addConsoleOutput(`❌ COMPILATION_ERROR: ${message}`);
                this.state.compiling = false;
                this.ui.showError(message);
            },
            
            onComplete: async (wasmBinary, metadata) => {
                this.state.compiledWasmBinary = wasmBinary;
                this.state.compiled = true;
                this.state.compiling = false;
                
                this.ui.addConsoleOutput(`✅ Compiled successfully (${wasmBinary.byteLength} bytes)`);
                
                // Auto-run console app
                this.ui.addConsoleOutput('');
                this.ui.addConsoleOutput('--- Program Output ---');
                await this.runConsoleApp();
                this.ui.addConsoleOutput('--- End Output ---');
                this.ui.addConsoleOutput('');
            }
        });
        
        this.ui.addConsoleOutput('✅ GoScript: Module callbacks wired');
    }

    /**
     * Start the compilation pipeline
     * @param {string} filePath - Path to the main.go file to compile
     * @private
     */
    async startCompilation(filePath) {
        if (this.state.compiling) {
            this.ui.addConsoleOutput('⚠️ GoScript: Compilation already in progress');
            return;
        }

        try {
            this.state.compiling = true;
            this.ui.addConsoleOutput(`🔄 GoScript: Compiling ${filePath}...`);
            
            // Read source from VFS
            const vfs = this.modules.vfs;
            if (!vfs.exists(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            let sourceCode = vfs.readFile(filePath);
            if (sourceCode instanceof Uint8Array) {
                sourceCode = new TextDecoder().decode(sourceCode);
            }
            
            // Store source code for mock execution
            this.state.lastSourceCode = sourceCode;
            
            const sourceFiles = { 'main.go': sourceCode };
            
            // Start compilation
            await this.modules.compilationManager.compile(sourceFiles);
            
            // Compilation completion is handled by callbacks
            
        } catch (error) {
            this.state.compiling = false;
            this.ui.addConsoleOutput(`❌ GoScript: Compilation failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the compilation pipeline with editor support (legacy)
     * @private
     */
    async startCompilationWithEditor() {
        if (this.state.compiling) {
            this.ui.addConsoleOutput('⚠️ GoScript: Compilation already in progress');
            return;
        }

        try {
            this.state.compiling = true;
            this.ui.addConsoleOutput('🔄 GoScript: Starting compilation pipeline...');
            
            // Check if we have an active tab with content
            if (this.activeTab) {
                const sourceCode = this.editor.getValue();
                this.state.lastSourceCode = sourceCode;
                const sourceFiles = { 'main.go': sourceCode };
                await this.modules.compilationManager.compile(sourceFiles);
            } else {
                throw new Error('No file open. Use: cd /examples/hello && go run main.go');
            }
            
        } catch (error) {
            this.state.compiling = false;
            this.ui.addConsoleOutput(`❌ GoScript: Compilation failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Launch the compiled application
     */
    async launchApplication() {
        if (!this.state.compiled || !this.state.compiledWasmBinary) {
            this.ui.addConsoleOutput('❌ GoScript: No compiled binary available for launch');
            return;
        }

        try {
            this.state.running = true;
            this.ui.addConsoleOutput('🚀 GoScript: Launching compiled application...');
            
            // Execute the WASM binary
            await this.modules.appRunner.execute(this.state.compiledWasmBinary);
            
            this.ui.addConsoleOutput('✅ GoScript: Application launched successfully');
            
        } catch (error) {
            this.state.running = false;
            this.ui.addConsoleOutput(`❌ GoScript: Launch failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Run the compiled application in console mode
     */
    async runConsoleApp() {
        if (!this.state.compiled || !this.state.compiledWasmBinary) {
            this.ui.addConsoleOutput('❌ GoScript: No compiled binary available');
            return;
        }
        
        try {
            // Pass source code for mock execution
            await this.modules.appRunner.executeConsole(
                this.state.compiledWasmBinary, 
                this.state.lastSourceCode
            );
        } catch (error) {
            this.ui.addConsoleOutput(`❌ GoScript: Execution failed - ${error.message}`);
        }
    }

    /**
     * Get system status
     * @returns {Object} Current system state
     */
    getStatus() {
        return {
            ...this.state,
            modules: Object.keys(this.modules).reduce((acc, key) => {
                acc[key] = !!this.modules[key];
                return acc;
            }, {}),
            appRunnerStatus: this.modules.appRunner?.getStatus() || null
        };
    }

    /**
     * Reset the system to initial state
     */
    reset() {
        this.ui.addConsoleOutput('🔄 GoScript: Resetting system...');
        
        // Stop running application
        if (this.modules.appRunner && this.state.running) {
            this.modules.appRunner.stop();
        }
        
        // Reset state
        this.state = {
            initialized: false,
            compiling: false,
            compiled: false,
            running: false,
            compiledWasmBinary: null,
            lastSourceCode: null
        };
        
        // Clear VFS
        if (this.modules.vfs) {
            this.modules.vfs.clear();
        }
        
        this.ui.addConsoleOutput('✅ GoScript: System reset complete');
    }

    /**
     * Get compilation and cache statistics
     * @returns {Promise<Object>} System statistics
     */
    async getStats() {
        const stats = {
            vfs: this.modules.vfs?.getStats() || null,
            cache: await this.modules.cacheManager?.getStats() || null,
            compilation: {
                status: this.modules.compilationManager?.getStatus() || 'unknown',
                hasBinary: !!this.state.compiledWasmBinary,
                binarySize: this.state.compiledWasmBinary?.byteLength || 0
            }
        };
        
        return stats;
    }

    /**
     * Setup the interactive terminal
     * @private
     */
    setupTerminal() {
        const input = document.getElementById('terminal-input');
        const container = document.getElementById('terminal-container');
        
        if (!input || !container) return;

        this.commandHistory = [];
        this.historyIndex = -1;

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTabCompletion(input);
            } else if (e.key === 'Enter') {
                const command = input.value;
                input.value = '';
                
                // Add to history
                if (command.trim()) {
                    this.commandHistory.push(command);
                    this.historyIndex = this.commandHistory.length;
                }

                // Echo command
                this.ui.addConsoleOutput(`$ ${command}`);
                
                await this.handleCommand(command.trim());
                
                // Scroll to bottom
                container.scrollTop = container.scrollHeight;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    input.value = this.commandHistory[this.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    input.value = this.commandHistory[this.historyIndex];
                } else {
                    this.historyIndex = this.commandHistory.length;
                    input.value = '';
                }
            }
        });
        
        // Focus input on click
        container.addEventListener('click', () => input.focus());
        input.focus();
    }

    /**
     * Open a file in the editor
     * @param {string} filePath - Path to the file
     */
    openFileInEditor(filePath) {
        const vfs = this.modules.vfs;
        
        if (!vfs.exists(filePath)) {
            this.ui.addConsoleOutput(`cat: ${filePath}: No such file`);
            return;
        }
        
        // Save current tab content if modified
        if (this.activeTab && this.tabModified.get(this.activeTab)) {
            this.tabContent.set(this.activeTab, this.editor.getValue());
        }
        
        // Read file content
        let content = vfs.readFile(filePath);
        if (content instanceof Uint8Array) {
            content = new TextDecoder().decode(content);
        }
        
        // Add tab if not already open
        if (!this.openTabs.includes(filePath)) {
            this.openTabs.push(filePath);
            this.tabContent.set(filePath, content);
            this.tabModified.set(filePath, false);
        }
        
        // Set as active tab
        this.activeTab = filePath;
        
        // Update editor with file content (use stored content if available and modified)
        const displayContent = this.tabModified.get(filePath) 
            ? this.tabContent.get(filePath) 
            : content;
        this.editor.setValue(displayContent);
        this.editor.clearHistory();  // Clear undo history for new file
        
        // Update file path display
        document.getElementById('current-file-path').textContent = filePath;
        
        // Render tabs
        this.renderTabs();
    }

    /**
     * Close a tab
     * @param {string} filePath - Path to the file tab to close
     */
    closeTab(filePath) {
        const index = this.openTabs.indexOf(filePath);
        if (index === -1) return;
        
        // Check for unsaved changes
        if (this.tabModified.get(filePath)) {
            // For now, just warn (could add confirmation dialog)
            this.ui.addConsoleOutput(`⚠️ Discarding unsaved changes in ${filePath}`);
        }
        
        this.openTabs.splice(index, 1);
        this.tabContent.delete(filePath);
        this.tabModified.delete(filePath);
        
        // If closing active tab, switch to another
        if (this.activeTab === filePath) {
            if (this.openTabs.length > 0) {
                const newActive = this.openTabs[Math.max(0, index - 1)];
                this.openFileInEditor(newActive);
            } else {
                this.activeTab = null;
                this.editor.setValue('// No file open\n// Use: cd /examples/hello && cat main.go');
                document.getElementById('current-file-path').textContent = 'No file open';
            }
        }
        
        this.renderTabs();
    }

    /**
     * Render editor tabs
     * @private
     */
    renderTabs() {
        const tabsContainer = document.getElementById('editor-tabs');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = '';
        
        for (const filePath of this.openTabs) {
            const tab = document.createElement('div');
            const isModified = this.tabModified.get(filePath);
            tab.className = `editor-tab font-mono ${filePath === this.activeTab ? 'active' : ''} ${isModified ? 'modified' : ''}`;
            
            // Get just the filename for display
            const fileName = filePath.split('/').pop();
            const dirName = filePath.split('/').slice(-2, -1)[0] || '';
            
            tab.innerHTML = `
                <span class="tab-name">${dirName}/${fileName}</span>
                <span class="tab-close" onclick="event.stopPropagation(); pws2025.closeTab('${filePath}')">×</span>
            `;
            
            tab.onclick = () => this.openFileInEditor(filePath);
            tabsContainer.appendChild(tab);
        }
    }

    /**
     * Update terminal prompt with current directory
     * @private
     */
    updatePrompt() {
        const prompt = document.getElementById('terminal-prompt');
        if (prompt) {
            // Show abbreviated path for long paths
            let displayPath = this.currentDir;
            if (displayPath.length > 25) {
                const parts = displayPath.split('/').filter(p => p);
                displayPath = '.../' + parts.slice(-2).join('/');
            }
            prompt.textContent = `${displayPath} $`;
        }
    }

    /**
     * Handle terminal commands
     * @param {string} cmd 
     */
    async handleCommand(cmd) {
        if (!cmd) return;
        
        // Simple argument parsing handling quotes
        const args = cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/"/g, '')) || [];
        const command = args[0];
        const vfs = this.modules.vfs;

        // Helper to resolve path
        const resolvePath = (path) => {
            if (!path) return this.currentDir;
            if (path.startsWith('/')) return path;
            if (this.currentDir === '/') return '/' + path;
            return this.currentDir + '/' + path;
        };

        // Normalize path (handle .. and .)
        const normalizePath = (path) => {
            const parts = path.split('/').filter(p => p && p !== '.');
            const result = [];
            for (const part of parts) {
                if (part === '..') {
                    result.pop();
                } else {
                    result.push(part);
                }
            }
            return '/' + result.join('/');
        };
        
        switch(command) {
            case 'help':
                this.ui.addConsoleOutput('Available commands:');
                this.ui.addConsoleOutput('  Navigation: ls, cd, pwd');
                this.ui.addConsoleOutput('  Files:      cat, head, tail, grep, touch, rm, cp, mv');
                this.ui.addConsoleOutput('  Go:         go run <file>, go version');
                this.ui.addConsoleOutput('  Other:      clear, echo, history, date, whoami, help');
                this.ui.addConsoleOutput('');
                this.ui.addConsoleOutput('Example: cd /examples/fibonacci && go run main.go');
                break;
            case 'clear':
                document.getElementById('console-output').textContent = '';
                break;
            case 'date':
                this.ui.addConsoleOutput(new Date().toString());
                break;
            case 'whoami':
                this.ui.addConsoleOutput('gopher');
                break;
            case 'pwd':
                this.ui.addConsoleOutput(this.currentDir);
                break;
            case 'echo':
                this.ui.addConsoleOutput(args.slice(1).join(' '));
                break;
            case 'ls':
                const lsPath = args[1] ? normalizePath(resolvePath(args[1])) : this.currentDir;
                try {
                    const files = vfs.listDir(lsPath);
                    if (files.length === 0) {
                        this.ui.addConsoleOutput('(empty directory)');
                    } else {
                        // Color directories differently
                        const output = files.map(f => {
                            if (vfs.directories.has(normalizePath(lsPath + '/' + f))) {
                                return `\x1b[34m${f}/\x1b[0m`;
                            }
                            return f;
                        }).join('  ');
                        this.ui.addConsoleOutput(files.join('  '));
                    }
                } catch (e) {
                    this.ui.addConsoleOutput(`ls: ${e.message}`);
                }
                break;
            case 'cd':
                const target = args[1] || '/';
                const newPath = normalizePath(resolvePath(target));
                
                // Check if directory exists
                if (newPath === '/' || vfs.directories.has(newPath) || vfs.listDir(newPath).length > 0) {
                    this.currentDir = newPath || '/';
                    this.updatePrompt();
                } else {
                    this.ui.addConsoleOutput(`cd: ${target}: No such directory`);
                }
                break;
            case 'mkdir':
                if (!args[1]) { this.ui.addConsoleOutput('mkdir: missing operand'); break; }
                vfs.mkdir(normalizePath(resolvePath(args[1])));
                break;
            case 'touch':
                if (!args[1]) { this.ui.addConsoleOutput('touch: missing operand'); break; }
                vfs.writeFile(normalizePath(resolvePath(args[1])), '');
                break;
            case 'rm':
                if (!args[1]) { this.ui.addConsoleOutput('rm: missing operand'); break; }
                const rmPath = normalizePath(resolvePath(args[1]));
                if (vfs.files.has(rmPath)) {
                    vfs.files.delete(rmPath);
                } else {
                    this.ui.addConsoleOutput(`rm: ${args[1]}: No such file`);
                }
                break;
            case 'cat':
                if (!args[1]) { this.ui.addConsoleOutput('cat: missing operand'); break; }
                try {
                    const catPath = normalizePath(resolvePath(args[1]));
                    const content = vfs.readFile(catPath);
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    this.ui.addConsoleOutput(text);
                    
                    // Also open in editor if it's a .go file
                    if (catPath.endsWith('.go')) {
                        this.openFileInEditor(catPath);
                    }
                } catch (e) {
                    this.ui.addConsoleOutput(`cat: ${e.message}`);
                }
                break;
            case 'cp':
                if (args.length < 3) { this.ui.addConsoleOutput('cp: missing file operand'); break; }
                try {
                    const src = vfs.readFile(normalizePath(resolvePath(args[1])));
                    vfs.writeFile(normalizePath(resolvePath(args[2])), src);
                } catch (e) {
                    this.ui.addConsoleOutput(`cp: ${e.message}`);
                }
                break;
            case 'mv':
                if (args.length < 3) { this.ui.addConsoleOutput('mv: missing file operand'); break; }
                try {
                    const srcPath = normalizePath(resolvePath(args[1]));
                    const destPath = normalizePath(resolvePath(args[2]));
                    const srcContent = vfs.readFile(srcPath);
                    vfs.writeFile(destPath, srcContent);
                    vfs.files.delete(srcPath);
                } catch (e) {
                    this.ui.addConsoleOutput(`mv: ${e.message}`);
                }
                break;
            case 'grep':
                if (args.length < 3) { this.ui.addConsoleOutput('grep: usage: grep PATTERN FILE'); break; }
                try {
                    const pattern = args[1];
                    const content = vfs.readFile(normalizePath(resolvePath(args[2])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n');
                    lines.forEach(line => {
                        if (line.includes(pattern)) this.ui.addConsoleOutput(line);
                    });
                } catch (e) {
                    this.ui.addConsoleOutput(`grep: ${e.message}`);
                }
                break;
            case 'head':
                if (!args[1]) { this.ui.addConsoleOutput('head: missing operand'); break; }
                try {
                    const content = vfs.readFile(normalizePath(resolvePath(args[1])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n').slice(0, 10);
                    this.ui.addConsoleOutput(lines.join('\n'));
                } catch (e) {
                    this.ui.addConsoleOutput(`head: ${e.message}`);
                }
                break;
            case 'tail':
                if (!args[1]) { this.ui.addConsoleOutput('tail: missing operand'); break; }
                try {
                    const content = vfs.readFile(normalizePath(resolvePath(args[1])));
                    const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
                    const lines = text.split('\n');
                    this.ui.addConsoleOutput(lines.slice(-10).join('\n'));
                } catch (e) {
                    this.ui.addConsoleOutput(`tail: ${e.message}`);
                }
                break;
            case 'history':
                this.commandHistory.forEach((cmd, i) => {
                    this.ui.addConsoleOutput(`${i + 1}  ${cmd}`);
                });
                break;
            case 'exit':
                this.ui.addConsoleOutput('logout');
                break;
            case 'go':
                if (args[1] === 'run') {
                    // Determine the file to run
                    let fileToRun = args[2] || 'main.go';
                    const fullPath = normalizePath(resolvePath(fileToRun));
                    
                    if (!vfs.exists(fullPath)) {
                        this.ui.addConsoleOutput(`go run: ${fileToRun}: no such file`);
                        break;
                    }
                    
                    // Open in editor
                    this.openFileInEditor(fullPath);
                    
                    // Run compilation
                    await this.startCompilation(fullPath);
                } else if (args[1] === 'version') {
                    this.ui.addConsoleOutput('go version go1.21.0 js/wasm');
                } else {
                    this.ui.addConsoleOutput('Usage: go run <file.go>');
                    this.ui.addConsoleOutput('       go version');
                }
                break;
            case './main.wasm':
                if (this.state.compiled) {
                    await this.launchApplication();
                } else {
                    this.ui.addConsoleOutput('bash: ./main.wasm: No such file or directory (compile first)');
                }
                break;
            case 'tree':
                this.ui.addConsoleOutput(vfs.getFileTree());
                break;
            default:
                this.ui.addConsoleOutput(`bash: command not found: ${command}`);
        }
    }
}

// Export globally for use in HTML
window.PersonalWebsite2025 = PersonalWebsite2025;