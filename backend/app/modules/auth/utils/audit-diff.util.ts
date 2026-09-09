/**
 * Calculate changes between two objects
 * Returns objects containing only the fields that changed
 */
export function calculateChanges(oldData: any, newData: any): { old: any; new: any } {
  if (!oldData || !newData) {
    return {
      old: oldData || {},
      new: newData || {},
    };
  }

  const oldChanges: any = {};
  const newChanges: any = {};
  
  // Helper to check if values are effectively equal
  const _isEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    // Handle dates
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (typeof a === 'string' && typeof b === 'string' && !isNaN(Date.parse(a)) && !isNaN(Date.parse(b))) {
        // Attempt date comparison for strings if they look like dates
        return a === b;
    }
    
    return false;
  };
  // Silence unused variable warning
  void _isEqual;

  // Fields to ignore
  const ignoredFields = ['updatedAt', 'updated_at', 'createdAt', 'created_at', 'modificationdate', 'modificationid', 'password', 'token', 'accessToken', 'refreshToken', 'code'];

  // Get keys to compare
  // We only compare keys that exist in BOTH oldData and newData.
  const newDataKeys = Object.keys(newData);
  const keysToCompare = newDataKeys.filter(key => 
    Object.prototype.hasOwnProperty.call(oldData, key)
  );

  for (const key of keysToCompare) {
    if (ignoredFields.includes(key)) continue;

    const oldValue = oldData[key];
    const newValue = newData[key];

    // If both are undefined/null, skip
    if ((oldValue === undefined || oldValue === null) && (newValue === undefined || newValue === null)) {
        continue;
    }

    // Check if values are different
    let areDifferent: boolean;
    
    if (oldValue instanceof Date && newValue instanceof Date) {
        areDifferent = oldValue.getTime() !== newValue.getTime();
    } else if (oldValue instanceof Date && typeof newValue === 'string') {
         areDifferent = oldValue.toISOString() !== newValue; // Simplistic
    } else if (typeof oldValue === 'object' && oldValue !== null && typeof newValue === 'object' && newValue !== null) {
        // Recurse or simple compare
        const oldStr = JSON.stringify(oldValue);
        const newStr = JSON.stringify(newValue);
        areDifferent = oldStr !== newStr;
        
        if (areDifferent && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
            const subDiff = calculateChanges(oldValue, newValue);
            if (Object.keys(subDiff.old).length > 0 || Object.keys(subDiff.new).length > 0) {
                oldChanges[key] = subDiff.old;
                newChanges[key] = subDiff.new;
                continue; 
            }
        }
    } else {
        areDifferent = oldValue !== newValue;
    }

    if (areDifferent) {
      oldChanges[key] = oldValue;
      newChanges[key] = newValue;
    }
  }

  return {
    old: oldChanges,
    new: newChanges,
  };
}




