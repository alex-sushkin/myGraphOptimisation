const { logger } = require('../src/bootstrap/logger');

async function query(text, values = undefined) {
    if (client === null) {
        client = await createClient();
    }

    return new Promise(((resolve, reject) => {
        client.query(text, values, (error, result) => {
            if (error) {
                logger.error('Ошибка выполнения запроса в базе данных');
                logger.error(error);
                logger.error(text);
                logger.error(values);

                reject(error);
            }

            resolve(result);
        });
    }));
}

function findCycle(adj) {
    const visited = new Map();
    const onStack = new Map();
    const stack = [];
    let cycle = null;

    for (const node of adj.keys()) {
        visited.set(node, false);
        onStack.set(node, false);
    }

    function dfs(node) {
        visited.set(node, true);
        onStack.set(node, true);
        stack.push(node);

        for (const neighbor of adj.get(node) || []) {
            if (!visited.get(neighbor)) {
                if (dfs(neighbor)) {
                    return true;
                }
            } else if (onStack.get(neighbor)) {
                // Найден цикл: от текущего узла до neighbor
                cycle = stack.slice(stack.indexOf(neighbor));
                cycle.push(neighbor); // Замыкаем цикл
                return true;
            }
        }

        onStack.set(node, false);
        stack.pop();
        return false;
    }

    for (const node of adj.keys()) {
        if (!visited.get(node) && dfs(node)) {
            break;
        }
    }

    return cycle;
}

async function phasesSort(phases) {
    const phaseIds = phases.map(p => p.id);
    // Получаем зависимости
    const dependencies = (
        (
            await query(`
        SELECT master_phase_id, slave_phase_id
        FROM phases_dependencies
        WHERE master_phase_id IN (${phaseIds.join(',')})
    `)
        ).rows || []
    ).map(con => ({
        from: con.slave_phase_id,
        to: con.master_phase_id,
    }));

    // Инициализация структур
    const adj = new Map();
    const indegree = new Map();
    const parents = new Map();
    const indexMap = new Map(); // Для сохранения исходного порядка

    phaseIds.forEach((id, index) => {
        adj.set(id, []);
        indegree.set(id, 0);
        parents.set(id, []);
        indexMap.set(id, index);
    });

    // Построение графа в направлении slave -> master
    for (const { from: slave, to: master } of dependencies) {
        if (!adj.has(slave) || !adj.has(master)) {
            continue;
        }
        adj.get(slave).push(master);
        indegree.set(master, indegree.get(master) + 1);
        parents.get(master).push(slave);
    }

    // Топологическая сортировка (BFS)
    const queue = [];
    for (const [id, deg] of indegree) {
        if (deg === 0) {
            queue.push(id);
        }
    }

    const sorted = [];
    while (queue.length > 0) {
        const u = queue.shift();
        sorted.push(u);
        for (const v of adj.get(u)) {
            indegree.set(v, indegree.get(v) - 1);
            if (indegree.get(v) === 0) {
                queue.push(v);
            }
        }
    }

    // Обнаружение циклов
    if (sorted.length !== phaseIds.length) {
        // Собираем узлы, оставшиеся с ненулевой степенью
        const cycleNodes = new Set(
            [...indegree].filter(([id, deg]) => deg > 0).map(([id]) => id),
        );

        // Строим подграф только для циклических узлов
        const cycleAdj = new Map();
        for (const id of cycleNodes) {
            cycleAdj.set(
                id,
                adj.get(id).filter(neighbor => cycleNodes.has(neighbor)),
            );
        }

        // Находим цикл
        const cycle = findCycle(cycleAdj);

        const message = {
            error: 'CYCLE_DETECTED',
            cycle: cycle || [...cycleNodes],
            message: cycle
                ? `Обнаружен цикл: ${cycle.join(' → ')}`
                : 'Обнаружен цикл (не удалось определить точный путь)',
        };
        logger.error(message);
        throw new Error('Detected a cycle in phase dependencies');
    }

    // Вычисление рангов
    const rankMap = new Map();
    for (const id of phaseIds) rankMap.set(id, 0);
    const phaseRanks = [];

    for (const id of sorted) {
        let maxParentRank = -1;
        for (const parent of parents.get(id)) {
            maxParentRank = Math.max(maxParentRank, rankMap.get(parent));
        }
        const newRank = maxParentRank + 1;
        rankMap.set(id, newRank);
        phaseRanks.push({ id, rank: newRank });
    }

    // Сортировка фаз по рангу и исходному порядку
    const sortedPhases = [...phases].sort((a, b) => {
        const rankA = rankMap.get(a.id);
        const rankB = rankMap.get(b.id);
        if (rankA !== rankB) {
            return rankA - rankB;
        }
        return indexMap.get(a.id) - indexMap.get(b.id);
    });

    return {
        phasesIds: sortedPhases,
        phasesRanks: phaseRanks,
    };
}

module.exports = {
    phasesSort,
};
