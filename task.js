//1) функция выявления из графа всех возможных посещений вершин от начальной
//2) функция которая будет искать кратчайший путь и должна вернуть определенный ответ промис

const graph = { 'A': ['B', 'D'], 'C': ['F', 'N', 'K'], 'B': ['E', 'F'], 'D': ['C'] }
function searchAviaPoint(from) {
  let array = [...graph[from]]
  let visitedArr = new Set(from)
  let result = [from]
  while (array.length > 0) {
    let current = array[0]
    if(!visitedArr.has(current)){
      visitedArr.add(current)
      result.push(current)
      if (graph[current] !== undefined) {
        array = [...array, ...graph[current]]
      }
    }
    array.shift(current)
  }
  return result
} 

// [ A, K , [A, D, C , K]] пример ответа
function fetchFlights(from, to, searchAviaPoint) {
  const array = searchAviaPoint(from)
  let queue = [{ city: from, path: [from] }]
  let visitedArr = new Set()

  if (!array.includes(to)) {
    console.log(from, to , 'none');
    return Promise.reject("No path found");
  }
  while (queue.length > 0) {
    let current = queue[0]
    if (current.city === to) {
      console.log(from, to, current.path)
      return Promise.resolve(from, to, current.path)
    }

    if (!visitedArr.has(current.city)) {
      visitedArr.add(current.city)
      if (graph[current.city] !== undefined) {
        for (let neighbor of graph[current.city]) {
          if (!visitedArr.has(neighbor)){
            console.log(current.city, neighbor,current.path)
            queue.push({ city: neighbor, path: [...current.path, neighbor]})
          }
        }

      }
    }
    queue.shift(current)
  }

  
}

fetchFlights('A', 'K', searchAviaPoint)
