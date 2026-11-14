use crate::helper::run;
use super::parent_item; // flag

mod inner {
    pub fn go() {
        super::top(); // flag
        crate::top();
    }
}
