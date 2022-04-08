export function requiredData(prop){
    console.trace(`${prop} is required`)
    throw new Error(`${ prop } is required`)
}