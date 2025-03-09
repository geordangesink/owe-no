// serialize nested Map to JSON
const mapToJson = (map) => {
  return JSON.stringify(
    [...map].map(([key, val]) => [
      key,
      val instanceof Map
        ? mapToJson(val)
        : val instanceof Date
          ? val.toISOString()
          : val
    ])
  )
}

// deserialize JSON back to a nested Map, handling Date objects
const jsonToMap = (jsonStr) => {
  return new Map(
    JSON.parse(jsonStr).map(([key, val]) => [
      key,
      typeof val === 'string' && val.startsWith('[')
        ? jsonToMap(val) // Recurse for nested Map
        : typeof val === 'string' &&
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(val)
          ? new Date(val) // Convert string to Date
          : val
    ])
  )
}

module.exports = { mapToJson, jsonToMap }
