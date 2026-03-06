// Shared GoScript playground examples
window.GoScriptExamples = {
            // ==================== BASICS ====================
            hello: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    fmt.Println("Welcome to GoScript - Go in your browser!")
}`,

            variables: `package main

import "fmt"

func main() {
    // Explicit type declaration
    var name string = "GoScript"
    var age int = 1
    var pi float64 = 3.14159
    var active bool = true
    
    // Short declaration (type inference)
    language := "Go"
    year := 2024
    
    fmt.Println("=== Variables & Types ===")
    fmt.Printf("Name: %s (type: %T)\\n", name, name)
    fmt.Printf("Age: %d (type: %T)\\n", age, age)
    fmt.Printf("Pi: %.5f (type: %T)\\n", pi, pi)
    fmt.Printf("Active: %t (type: %T)\\n", active, active)
    fmt.Printf("Language: %s (type: %T)\\n", language, language)
    fmt.Printf("Year: %d (type: %T)\\n", year, year)
    
    // Zero values
    var zeroInt int
    var zeroStr string
    var zeroBool bool
    fmt.Println("\\n=== Zero Values ===")
    fmt.Printf("int: %d, string: %q, bool: %t\\n", zeroInt, zeroStr, zeroBool)
}`,

            constants: `package main

import "fmt"

const (
    Pi       = 3.14159
    AppName  = "GoScript"
    MaxUsers = 1000
)

// iota for enumeration
const (
    Sunday = iota  // 0
    Monday         // 1
    Tuesday        // 2
    Wednesday      // 3
    Thursday       // 4
    Friday         // 5
    Saturday       // 6
)

// Bit flags with iota
const (
    Read   = 1 << iota  // 1
    Write              // 2
    Execute            // 4
)

func main() {
    fmt.Println("=== Constants ===")
    fmt.Printf("Pi: %v\\n", Pi)
    fmt.Printf("App: %s\\n", AppName)
    fmt.Printf("Max Users: %d\\n", MaxUsers)
    
    fmt.Println("\\n=== Days (iota) ===")
    fmt.Printf("Sunday=%d, Monday=%d, Friday=%d\\n", Sunday, Monday, Friday)
    
    fmt.Println("\\n=== Permissions (bit flags) ===")
    fmt.Printf("Read=%d, Write=%d, Execute=%d\\n", Read, Write, Execute)
    
    // Combining permissions
    readWrite := Read | Write
    fmt.Printf("Read+Write=%d\\n", readWrite)
}`,

            loops: `package main

import "fmt"

func main() {
    fmt.Println("=== For Loop (classic) ===")
    for i := 0; i < 5; i++ {
        fmt.Printf("i = %d\\n", i)
    }
    
    fmt.Println("\\n=== While-style Loop ===")
    count := 0
    for count < 3 {
        fmt.Printf("count = %d\\n", count)
        count++
    }
    
    fmt.Println("\\n=== Range over slice ===")
    fruits := []string{"apple", "banana", "cherry"}
    for index, fruit := range fruits {
        fmt.Printf("%d: %s\\n", index, fruit)
    }
    
    fmt.Println("\\n=== Range over map ===")
    ages := map[string]int{"Alice": 30, "Bob": 25}
    for name, age := range ages {
        fmt.Printf("%s is %d years old\\n", name, age)
    }
    
    fmt.Println("\\n=== Break and Continue ===")
    for i := 0; i < 10; i++ {
        if i == 3 {
            continue  // Skip 3
        }
        if i == 7 {
            break  // Stop at 7
        }
        fmt.Printf("%d ", i)
    }
    fmt.Println()
}`,

            conditionals: `package main

import "fmt"

func main() {
    x := 42
    
    fmt.Println("=== If-Else ===")
    if x > 50 {
        fmt.Println("x is greater than 50")
    } else if x > 25 {
        fmt.Println("x is between 26 and 50")
    } else {
        fmt.Println("x is 25 or less")
    }
    
    fmt.Println("\\n=== If with initialization ===")
    if y := x * 2; y > 50 {
        fmt.Printf("y (%d) is greater than 50\\n", y)
    }
    
    fmt.Println("\\n=== Switch ===")
    day := "Tuesday"
    switch day {
    case "Monday":
        fmt.Println("Start of work week")
    case "Tuesday", "Wednesday", "Thursday":
        fmt.Println("Midweek")
    case "Friday":
        fmt.Println("TGIF!")
    default:
        fmt.Println("Weekend!")
    }
    
    fmt.Println("\\n=== Switch without expression ===")
    score := 85
    switch {
    case score >= 90:
        fmt.Println("Grade: A")
    case score >= 80:
        fmt.Println("Grade: B")
    case score >= 70:
        fmt.Println("Grade: C")
    default:
        fmt.Println("Grade: F")
    }
}`,

            // ==================== FUNCTIONS ====================
            functions: `package main

import "fmt"

// Simple function
func greet(name string) {
    fmt.Printf("Hello, %s!\\n", name)
}

// Function with return value
func add(a, b int) int {
    return a + b
}

// Function with named return
func divide(a, b float64) (result float64, err string) {
    if b == 0 {
        err = "division by zero"
        return
    }
    result = a / b
    return
}

// Function as a value
func apply(fn func(int) int, value int) int {
    return fn(value)
}

func main() {
    fmt.Println("=== Simple Function ===")
    greet("GoScript")
    
    fmt.Println("\\n=== Return Value ===")
    sum := add(10, 20)
    fmt.Printf("10 + 20 = %d\\n", sum)
    
    fmt.Println("\\n=== Named Returns ===")
    result, err := divide(10, 3)
    fmt.Printf("10 / 3 = %.2f (err: %q)\\n", result, err)
    
    result, err = divide(10, 0)
    fmt.Printf("10 / 0 = %.2f (err: %q)\\n", result, err)
    
    fmt.Println("\\n=== Function as Value ===")
    double := func(x int) int { return x * 2 }
    fmt.Printf("apply(double, 5) = %d\\n", apply(double, 5))
}`,

            multireturn: `package main

import (
    "fmt"
    "strings"
)

// Returns multiple values
func minMax(numbers []int) (min, max int) {
    if len(numbers) == 0 {
        return 0, 0
    }
    min, max = numbers[0], numbers[0]
    for _, n := range numbers {
        if n < min {
            min = n
        }
        if n > max {
            max = n
        }
    }
    return
}

// Returns value and ok pattern
func lookup(data map[string]int, key string) (value int, ok bool) {
    value, ok = data[key]
    return
}

// Returns value and error
func parsePositive(s string) (int, error) {
    s = strings.TrimSpace(s)
    var n int
    _, err := fmt.Sscanf(s, "%d", &n)
    if err != nil {
        return 0, fmt.Errorf("invalid number: %s", s)
    }
    if n < 0 {
        return 0, fmt.Errorf("negative number: %d", n)
    }
    return n, nil
}

func main() {
    fmt.Println("=== Multiple Return Values ===")
    nums := []int{5, 2, 9, 1, 7, 3}
    min, max := minMax(nums)
    fmt.Printf("Numbers: %v\\n", nums)
    fmt.Printf("Min: %d, Max: %d\\n", min, max)
    
    fmt.Println("\\n=== Value, Ok Pattern ===")
    data := map[string]int{"apple": 5, "banana": 3}
    
    if val, ok := lookup(data, "apple"); ok {
        fmt.Printf("apple: %d\\n", val)
    }
    if val, ok := lookup(data, "orange"); !ok {
        fmt.Printf("orange not found (val=%d)\\n", val)
    }
    
    fmt.Println("\\n=== Value, Error Pattern ===")
    if n, err := parsePositive("42"); err == nil {
        fmt.Printf("Parsed: %d\\n", n)
    }
    if _, err := parsePositive("-5"); err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
}`,

            variadic: `package main

import "fmt"

// Variadic function - accepts any number of ints
func sum(numbers ...int) int {
    total := 0
    for _, n := range numbers {
        total += n
    }
    return total
}

// Mix regular and variadic parameters
func printf(format string, args ...interface{}) {
    fmt.Printf(format, args...)
}

// Join strings with separator
func join(sep string, parts ...string) string {
    result := ""
    for i, part := range parts {
        if i > 0 {
            result += sep
        }
        result += part
    }
    return result
}

func main() {
    fmt.Println("=== Variadic Functions ===")
    
    fmt.Printf("sum() = %d\\n", sum())
    fmt.Printf("sum(1) = %d\\n", sum(1))
    fmt.Printf("sum(1, 2, 3) = %d\\n", sum(1, 2, 3))
    fmt.Printf("sum(1, 2, 3, 4, 5) = %d\\n", sum(1, 2, 3, 4, 5))
    
    fmt.Println("\\n=== Spread Operator ===")
    nums := []int{10, 20, 30, 40}
    fmt.Printf("sum(nums...) = %d\\n", sum(nums...))
    
    fmt.Println("\\n=== Custom Printf ===")
    printf("Name: %s, Age: %d\\n", "Alice", 30)
    
    fmt.Println("\\n=== Join Function ===")
    fmt.Println(join(", ", "apple", "banana", "cherry"))
    fmt.Println(join(" -> ", "A", "B", "C", "D"))
}`,

            closures: `package main

import "fmt"

// Returns a closure that remembers its state
func counter() func() int {
    count := 0
    return func() int {
        count++
        return count
    }
}

// Returns a closure with a parameter
func multiplier(factor int) func(int) int {
    return func(x int) int {
        return x * factor
    }
}

// Closure capturing loop variable
func createPrinters() []func() {
    printers := make([]func(), 3)
    for i := 0; i < 3; i++ {
        i := i  // Create new variable for each iteration
        printers[i] = func() {
            fmt.Printf("Printer %d\\n", i)
        }
    }
    return printers
}

func main() {
    fmt.Println("=== Counter Closure ===")
    c1 := counter()
    c2 := counter()  // Independent counter
    
    fmt.Printf("c1: %d, %d, %d\\n", c1(), c1(), c1())
    fmt.Printf("c2: %d, %d\\n", c2(), c2())
    fmt.Printf("c1: %d\\n", c1())
    
    fmt.Println("\\n=== Multiplier Closure ===")
    double := multiplier(2)
    triple := multiplier(3)
    
    fmt.Printf("double(5) = %d\\n", double(5))
    fmt.Printf("triple(5) = %d\\n", triple(5))
    
    fmt.Println("\\n=== Loop Closures ===")
    printers := createPrinters()
    for _, p := range printers {
        p()
    }
}`,

            recursion: `package main

import "fmt"

// Classic factorial
func factorial(n int) int {
    if n <= 1 {
        return 1
    }
    return n * factorial(n-1)
}

// Tail-recursive factorial
func factorialTail(n, acc int) int {
    if n <= 1 {
        return acc
    }
    return factorialTail(n-1, n*acc)
}

// Binary search
func binarySearch(arr []int, target, low, high int) int {
    if low > high {
        return -1
    }
    mid := (low + high) / 2
    if arr[mid] == target {
        return mid
    }
    if arr[mid] > target {
        return binarySearch(arr, target, low, mid-1)
    }
    return binarySearch(arr, target, mid+1, high)
}

// Tree traversal
type Node struct {
    Value int
    Left  *Node
    Right *Node
}

func sumTree(node *Node) int {
    if node == nil {
        return 0
    }
    return node.Value + sumTree(node.Left) + sumTree(node.Right)
}

func main() {
    fmt.Println("=== Factorial ===")
    for i := 0; i <= 10; i++ {
        fmt.Printf("%d! = %d\\n", i, factorial(i))
    }
    
    fmt.Println("\\n=== Binary Search ===")
    arr := []int{1, 3, 5, 7, 9, 11, 13, 15}
    fmt.Printf("Array: %v\\n", arr)
    fmt.Printf("Search 7: index %d\\n", binarySearch(arr, 7, 0, len(arr)-1))
    fmt.Printf("Search 6: index %d\\n", binarySearch(arr, 6, 0, len(arr)-1))
    
    fmt.Println("\\n=== Tree Sum ===")
    tree := &Node{
        Value: 1,
        Left:  &Node{Value: 2, Left: &Node{Value: 4}, Right: &Node{Value: 5}},
        Right: &Node{Value: 3, Left: &Node{Value: 6}, Right: &Node{Value: 7}},
    }
    fmt.Printf("Sum of tree (1-7): %d\\n", sumTree(tree))
}`,

            // ==================== DATA STRUCTURES ====================
            arrays: `package main

import "fmt"

func main() {
    fmt.Println("=== Arrays (fixed size) ===")
    var arr [5]int
    arr[0] = 10
    arr[1] = 20
    fmt.Printf("Array: %v, Length: %d\\n", arr, len(arr))
    
    // Array literal
    primes := [5]int{2, 3, 5, 7, 11}
    fmt.Printf("Primes: %v\\n", primes)
    
    fmt.Println("\\n=== Slices (dynamic) ===")
    // Create slice
    slice := []int{1, 2, 3}
    fmt.Printf("Slice: %v, Len: %d, Cap: %d\\n", slice, len(slice), cap(slice))
    
    // Append
    slice = append(slice, 4, 5)
    fmt.Printf("After append: %v\\n", slice)
    
    // Slicing
    fmt.Printf("slice[1:3]: %v\\n", slice[1:3])
    fmt.Printf("slice[:3]: %v\\n", slice[:3])
    fmt.Printf("slice[2:]: %v\\n", slice[2:])
    
    fmt.Println("\\n=== Make ===")
    made := make([]int, 3, 10)  // len=3, cap=10
    fmt.Printf("Make: %v, Len: %d, Cap: %d\\n", made, len(made), cap(made))
    
    fmt.Println("\\n=== Copy ===")
    src := []int{1, 2, 3}
    dst := make([]int, len(src))
    copy(dst, src)
    dst[0] = 100
    fmt.Printf("Source: %v, Dest: %v\\n", src, dst)
    
    fmt.Println("\\n=== 2D Slice ===")
    matrix := [][]int{
        {1, 2, 3},
        {4, 5, 6},
        {7, 8, 9},
    }
    for i, row := range matrix {
        fmt.Printf("Row %d: %v\\n", i, row)
    }
}`,

            maps: `package main

import "fmt"

func main() {
    fmt.Println("=== Creating Maps ===")
    
    // Using make
    ages := make(map[string]int)
    ages["Alice"] = 30
    ages["Bob"] = 25
    
    // Map literal
    scores := map[string]int{
        "Math":    95,
        "English": 87,
        "Science": 92,
    }
    
    fmt.Printf("Ages: %v\\n", ages)
    fmt.Printf("Scores: %v\\n", scores)
    
    fmt.Println("\\n=== Access & Check ===")
    fmt.Printf("Alice's age: %d\\n", ages["Alice"])
    
    // Check if key exists
    if age, ok := ages["Charlie"]; ok {
        fmt.Printf("Charlie's age: %d\\n", age)
    } else {
        fmt.Println("Charlie not found")
    }
    
    fmt.Println("\\n=== Modify ===")
    ages["Charlie"] = 35  // Add
    ages["Alice"] = 31    // Update
    delete(ages, "Bob")   // Delete
    fmt.Printf("Modified: %v\\n", ages)
    
    fmt.Println("\\n=== Iterate ===")
    for name, age := range ages {
        fmt.Printf("%s: %d\\n", name, age)
    }
    
    fmt.Println("\\n=== Nested Maps ===")
    users := map[string]map[string]string{
        "user1": {"name": "Alice", "email": "alice@example.com"},
        "user2": {"name": "Bob", "email": "bob@example.com"},
    }
    for id, data := range users {
        fmt.Printf("%s: %s (%s)\\n", id, data["name"], data["email"])
    }
}`,

            structs: `package main

import "fmt"

type Person struct {
    Name string
    Age  int
    City string
}

func (p Person) Greet() {
    fmt.Printf("Hi, I'm %s, %d years old from %s!\\n", p.Name, p.Age, p.City)
}

func main() {
    people := []Person{
        {"Alice", 30, "New York"},
        {"Bob", 25, "San Francisco"},
        {"Charlie", 35, "Seattle"},
    }
    
    fmt.Println("Meet our team:")
    fmt.Println()
    
    for _, p := range people {
        p.Greet()
    }
}`,

            interfaces: `package main

import (
    "fmt"
    "math"
)

// Interface definition
type Shape interface {
    Area() float64
    Perimeter() float64
}

// Rectangle implements Shape
type Rectangle struct {
    Width, Height float64
}

func (r Rectangle) Area() float64 {
    return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
    return 2 * (r.Width + r.Height)
}

// Circle implements Shape
type Circle struct {
    Radius float64
}

func (c Circle) Area() float64 {
    return math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
    return 2 * math.Pi * c.Radius
}

// Function accepting interface
func printShapeInfo(s Shape) {
    fmt.Printf("Area: %.2f, Perimeter: %.2f\\n", s.Area(), s.Perimeter())
}

func main() {
    fmt.Println("=== Interfaces ===")
    
    rect := Rectangle{Width: 10, Height: 5}
    circle := Circle{Radius: 7}
    
    fmt.Println("Rectangle 10x5:")
    printShapeInfo(rect)
    
    fmt.Println("\\nCircle radius 7:")
    printShapeInfo(circle)
    
    fmt.Println("\\n=== Slice of Interfaces ===")
    shapes := []Shape{
        Rectangle{3, 4},
        Circle{5},
        Rectangle{6, 2},
    }
    
    for i, s := range shapes {
        fmt.Printf("Shape %d: Area = %.2f\\n", i+1, s.Area())
    }
    
    fmt.Println("\\n=== Type Assertion ===")
    var s Shape = Circle{10}
    if c, ok := s.(Circle); ok {
        fmt.Printf("It's a circle with radius %.0f\\n", c.Radius)
    }
}`,

            embedding: `package main

import "fmt"

// Base struct
type Animal struct {
    Name   string
    Age    int
}

func (a Animal) Describe() {
    fmt.Printf("%s is %d years old\\n", a.Name, a.Age)
}

// Embedded struct (composition)
type Dog struct {
    Animal      // Embedded
    Breed string
}

func (d Dog) Bark() {
    fmt.Printf("%s says: Woof!\\n", d.Name)
}

// Override method
func (d Dog) Describe() {
    fmt.Printf("%s is a %d year old %s\\n", d.Name, d.Age, d.Breed)
}

// Multiple embedding
type Address struct {
    City    string
    Country string
}

type Person struct {
    Name string
    Address  // Embedded
}

func main() {
    fmt.Println("=== Struct Embedding ===")
    
    dog := Dog{
        Animal: Animal{Name: "Buddy", Age: 3},
        Breed:  "Golden Retriever",
    }
    
    // Access embedded fields directly
    fmt.Printf("Name: %s\\n", dog.Name)
    fmt.Printf("Age: %d\\n", dog.Age)
    fmt.Printf("Breed: %s\\n", dog.Breed)
    
    fmt.Println("\\n=== Embedded Methods ===")
    dog.Describe()  // Uses Dog's Describe (override)
    dog.Animal.Describe()  // Explicit call to Animal's Describe
    dog.Bark()
    
    fmt.Println("\\n=== Multiple Embedding ===")
    person := Person{
        Name:    "Alice",
        Address: Address{City: "New York", Country: "USA"},
    }
    
    fmt.Printf("%s lives in %s, %s\\n", person.Name, person.City, person.Country)
}`,

            // ==================== ALGORITHMS ====================
            fibonacci: `package main

import "fmt"

func fib(n int) int {
    if n <= 1 {
        return n
    }
    return fib(n-1) + fib(n-2)
}

func main() {
    fmt.Println("Fibonacci Sequence:")
    for i := 0; i < 15; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fib(i))
    }
}`,

            fizzbuzz: `package main

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

            primes: `package main

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
    for i := 2; i <= 100; i++ {
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

            factorial: `package main

import "fmt"

// Recursive factorial
func factorialRecursive(n int) int {
    if n <= 1 {
        return 1
    }
    return n * factorialRecursive(n-1)
}

// Iterative factorial
func factorialIterative(n int) int {
    result := 1
    for i := 2; i <= n; i++ {
        result *= i
    }
    return result
}

// Big factorial using string (for large numbers)
func factorialBig(n int) string {
    if n <= 1 {
        return "1"
    }
    
    // Store digits in reverse order
    result := []int{1}
    
    for i := 2; i <= n; i++ {
        carry := 0
        for j := 0; j < len(result); j++ {
            product := result[j]*i + carry
            result[j] = product % 10
            carry = product / 10
        }
        for carry > 0 {
            result = append(result, carry%10)
            carry /= 10
        }
    }
    
    // Convert to string (reverse)
    str := ""
    for i := len(result) - 1; i >= 0; i-- {
        str += fmt.Sprintf("%d", result[i])
    }
    return str
}

func main() {
    fmt.Println("=== Factorial ===")
    fmt.Println()
    
    for i := 0; i <= 12; i++ {
        fmt.Printf("%2d! = %d\\n", i, factorialRecursive(i))
    }
    
    fmt.Println("\\n=== Big Factorials ===")
    for _, n := range []int{20, 50, 100} {
        result := factorialBig(n)
        if len(result) > 50 {
            fmt.Printf("%d! = %s... (%d digits)\\n", n, result[:50], len(result))
        } else {
            fmt.Printf("%d! = %s\\n", n, result)
        }
    }
}`,

            sorting: `package main

import "fmt"

// Bubble Sort
func bubbleSort(arr []int) []int {
    n := len(arr)
    result := make([]int, n)
    copy(result, arr)
    
    for i := 0; i < n-1; i++ {
        for j := 0; j < n-i-1; j++ {
            if result[j] > result[j+1] {
                result[j], result[j+1] = result[j+1], result[j]
            }
        }
    }
    return result
}

// Quick Sort
func quickSort(arr []int) []int {
    if len(arr) < 2 {
        return arr
    }
    
    result := make([]int, len(arr))
    copy(result, arr)
    quickSortHelper(result, 0, len(result)-1)
    return result
}

func quickSortHelper(arr []int, low, high int) {
    if low < high {
        pivot := partition(arr, low, high)
        quickSortHelper(arr, low, pivot-1)
        quickSortHelper(arr, pivot+1, high)
    }
}

func partition(arr []int, low, high int) int {
    pivot := arr[high]
    i := low - 1
    
    for j := low; j < high; j++ {
        if arr[j] <= pivot {
            i++
            arr[i], arr[j] = arr[j], arr[i]
        }
    }
    arr[i+1], arr[high] = arr[high], arr[i+1]
    return i + 1
}

// Merge Sort
func mergeSort(arr []int) []int {
    if len(arr) <= 1 {
        return arr
    }
    
    mid := len(arr) / 2
    left := mergeSort(arr[:mid])
    right := mergeSort(arr[mid:])
    
    return merge(left, right)
}

func merge(left, right []int) []int {
    result := make([]int, 0, len(left)+len(right))
    i, j := 0, 0
    
    for i < len(left) && j < len(right) {
        if left[i] <= right[j] {
            result = append(result, left[i])
            i++
        } else {
            result = append(result, right[j])
            j++
        }
    }
    
    result = append(result, left[i:]...)
    result = append(result, right[j:]...)
    return result
}

func main() {
    arr := []int{64, 34, 25, 12, 22, 11, 90, 45, 33, 21}
    
    fmt.Println("=== Sorting Algorithms ===")
    fmt.Printf("\\nOriginal: %v\\n", arr)
    
    fmt.Printf("\\nBubble Sort: %v\\n", bubbleSort(arr))
    fmt.Printf("Quick Sort:  %v\\n", quickSort(arr))
    fmt.Printf("Merge Sort:  %v\\n", mergeSort(arr))
}`,

            // ==================== ADVANCED ====================
            goroutines: `package main

import (
    "fmt"
    "time"
)

func worker(id int, done chan bool) {
    fmt.Printf("Worker %d starting\\n", id)
    time.Sleep(time.Millisecond * 100)
    fmt.Printf("Worker %d done\\n", id)
    done <- true
}

func main() {
    fmt.Println("=== Goroutines ===")
    fmt.Println()
    
    // Simple goroutine
    go func() {
        fmt.Println("Hello from goroutine!")
    }()
    
    // Wait a bit for the goroutine
    time.Sleep(time.Millisecond * 10)
    
    fmt.Println("\\n=== Multiple Workers ===")
    
    done := make(chan bool)
    
    // Start 3 workers
    for i := 1; i <= 3; i++ {
        go worker(i, done)
    }
    
    // Wait for all workers
    for i := 0; i < 3; i++ {
        <-done
    }
    
    fmt.Println("\\nAll workers completed!")
}`,

            channels: `package main

import "fmt"

func main() {
    fmt.Println("=== Unbuffered Channel ===")
    
    ch := make(chan string)
    
    go func() {
        ch <- "Hello"
        ch <- "World"
    }()
    
    fmt.Println(<-ch)
    fmt.Println(<-ch)
    
    fmt.Println("\\n=== Buffered Channel ===")
    
    buffered := make(chan int, 3)
    buffered <- 1
    buffered <- 2
    buffered <- 3
    
    fmt.Printf("Buffer len: %d, cap: %d\\n", len(buffered), cap(buffered))
    fmt.Println(<-buffered)
    fmt.Println(<-buffered)
    fmt.Println(<-buffered)
    
    fmt.Println("\\n=== Channel Direction ===")
    
    pinger := func(out chan<- string) {
        out <- "ping"
    }
    
    printer := func(in <-chan string) {
        fmt.Println(<-in)
    }
    
    ping := make(chan string)
    go pinger(ping)
    printer(ping)
    
    fmt.Println("\\n=== Range over Channel ===")
    
    nums := make(chan int)
    go func() {
        for i := 1; i <= 5; i++ {
            nums <- i
        }
        close(nums)
    }()
    
    for n := range nums {
        fmt.Printf("%d ", n)
    }
    fmt.Println()
}`,

            timed_loop: `package main

import (
    "fmt"
    "time"
)

func main() {
    fmt.Println("=== 10 Second Timed Counter ===")

    start := time.Now()
    deadline := start.Add(10 * time.Second)
    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop()

    count := 0

    for {
        now := <-ticker.C
        count++

        elapsed := now.Sub(start)
        remaining := deadline.Sub(now)
        if remaining < 0 {
            remaining = 0
        }

        fmt.Printf("tick %02d | elapsed: %.1fs | remaining: %.1fs\\n",
            count,
            elapsed.Seconds(),
            remaining.Seconds(),
        )

        if count >= 10 || !now.Before(deadline) {
            break
        }
    }

    total := time.Since(start)
    fmt.Printf("\\nFinished after %.2fs with %d ticks\\n", total.Seconds(), count)
}`,

            select_stmt: `package main

import (
    "fmt"
    "time"
)

func main() {
    fmt.Println("=== Select Statement ===")
    
    ch1 := make(chan string)
    ch2 := make(chan string)
    
    go func() {
        time.Sleep(time.Millisecond * 50)
        ch1 <- "one"
    }()
    
    go func() {
        time.Sleep(time.Millisecond * 100)
        ch2 <- "two"
    }()
    
    // Receive from whichever is ready first
    for i := 0; i < 2; i++ {
        select {
        case msg1 := <-ch1:
            fmt.Printf("Received: %s\\n", msg1)
        case msg2 := <-ch2:
            fmt.Printf("Received: %s\\n", msg2)
        }
    }
    
    fmt.Println("\\n=== Select with Timeout ===")
    
    ch := make(chan string)
    
    select {
    case msg := <-ch:
        fmt.Println(msg)
    case <-time.After(time.Millisecond * 50):
        fmt.Println("Timeout!")
    }
    
    fmt.Println("\\n=== Non-blocking Select ===")
    
    messages := make(chan string)
    
    select {
    case msg := <-messages:
        fmt.Println(msg)
    default:
        fmt.Println("No message available")
    }
}`,

            json: `package main

import (
    "encoding/json"
    "fmt"
)

type Person struct {
    Name    string   \`json:"name"\`
    Age     int      \`json:"age"\`
    Email   string   \`json:"email,omitempty"\`
    Skills  []string \`json:"skills"\`
    private string   // Not exported (lowercase)
}

func main() {
    fmt.Println("=== JSON Encoding ===")
    
    person := Person{
        Name:   "Alice",
        Age:    30,
        Email:  "alice@example.com",
        Skills: []string{"Go", "Python", "JavaScript"},
    }
    
    // Marshal to JSON
    jsonData, _ := json.Marshal(person)
    fmt.Printf("JSON: %s\\n", jsonData)
    
    // Pretty print
    prettyJSON, _ := json.MarshalIndent(person, "", "  ")
    fmt.Printf("\\nPretty JSON:\\n%s\\n", prettyJSON)
    
    fmt.Println("\\n=== JSON Decoding ===")
    
    jsonStr := \`{"name":"Bob","age":25,"skills":["Rust","C++"]}\`
    
    var decoded Person
    json.Unmarshal([]byte(jsonStr), &decoded)
    
    fmt.Printf("Name: %s\\n", decoded.Name)
    fmt.Printf("Age: %d\\n", decoded.Age)
    fmt.Printf("Skills: %v\\n", decoded.Skills)
    
    fmt.Println("\\n=== Dynamic JSON ===")
    
    dynamic := \`{"active":true,"count":42,"tags":["a","b"]}\`
    
    var data map[string]interface{}
    json.Unmarshal([]byte(dynamic), &data)
    
    for key, value := range data {
        fmt.Printf("%s: %v (%T)\\n", key, value, value)
    }
}`,

            errors: `package main

import (
    "errors"
    "fmt"
)

// Custom error type
type ValidationError struct {
    Field   string
    Message string
}

func (e ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Function returning error
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

// Wrapping errors
func processData(data string) error {
    if data == "" {
        return fmt.Errorf("processData failed: %w", errors.New("empty input"))
    }
    return nil
}

// Returning custom error
func validateAge(age int) error {
    if age < 0 {
        return ValidationError{Field: "age", Message: "cannot be negative"}
    }
    if age > 150 {
        return ValidationError{Field: "age", Message: "unrealistic value"}
    }
    return nil
}

func main() {
    fmt.Println("=== Basic Error Handling ===")
    
    result, err := divide(10, 2)
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
    } else {
        fmt.Printf("10 / 2 = %.2f\\n", result)
    }
    
    result, err = divide(10, 0)
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
    
    fmt.Println("\\n=== Wrapped Errors ===")
    
    err = processData("")
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
        
        // Unwrap
        if unwrapped := errors.Unwrap(err); unwrapped != nil {
            fmt.Printf("Unwrapped: %v\\n", unwrapped)
        }
    }
    
    fmt.Println("\\n=== Custom Errors ===")
    
    if err := validateAge(-5); err != nil {
        fmt.Printf("Validation error: %v\\n", err)
        
        // Type assertion
        if ve, ok := err.(ValidationError); ok {
            fmt.Printf("  Field: %s\\n", ve.Field)
            fmt.Printf("  Message: %s\\n", ve.Message)
        }
    }
    
    if err := validateAge(200); err != nil {
        fmt.Printf("Validation error: %v\\n", err)
    }
    
    if err := validateAge(25); err == nil {
        fmt.Println("Age 25 is valid!")
    }
}`
        };

        // Alias for select (reserved word)
        EXAMPLES['select'] = EXAMPLES.select_stmt;


window.GoScriptExamples.select = window.GoScriptExamples.select_stmt;
