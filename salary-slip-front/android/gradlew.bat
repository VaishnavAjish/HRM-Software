import { CollectionBase, CollectionStateBase, FocusableProps, FocusStrategy, HelpTextProps, InputBase, Key, LabelableProps, Node, TextInputBase, Validation, ValueBase } from '@react-types/shared';
import { FormValidationState } from '../form/useFormValidationState';
import { ListState } from '../list/useListState';
import { OverlayTriggerState } from '../overlays/useOverlayTriggerState';
export type MenuTriggerAction = 'focus' | 'input' | 'manual';
export type SelectionMode = 'single' | 'multiple';
export type ValueType<M extends SelectionMode> = M extends 'single' ? Key | null : Key[];
export type ChangeValueType<M extends SelectionMode> = M extends 'single' ? Key | null : Key[];
type ValidationType<M extends SelectionMode> = M extends 'single' ? Key | null : Key[];
export interface ComboBoxValidationValue<M extends SelectionMode = 'single'> {
    /**
     * The selected key in the ComboBox.
     * @deprecated
     */
    selectedKey: Key | null;
    /** The keys of the currently selected items. */
    value: ValidationType<M>;
    /** The value of the ComboBox input. */
    inputValue: string;
}
export interface ComboBoxProps<T, M extends SelectionMode = 'single'> extends CollectionBase<T>, InputBase, ValueBase<ValueType<M>, ChangeValueType<M>>, TextInputBase, Validation<ComboBoxValidationValue<M>>, FocusableProps<HTMLInputElement>, LabelableProps, HelpTextProps {
    /** The list of ComboBox items (uncontrolled). */
    defaultItems?: Iterable<T>;
    /** The list of ComboBox items (controlled). */
    items?: Iterable<T>;
    /** Method that is called when the open state of the menu changes. Returns the new open state and the action that caused the opening of the menu. */
    onOpenChange?: (isOpen: boolean, menuTrigger?: MenuTriggerAction) => void;
    /**
     * Whether single or multiple selection is enabled.
     * @default 'single'
     */
    selectionMode?: M;
    /**
     * The currently selected key in the collection (controlled).
     * @deprecated
     */
    selectedKey?: Key | null;
    /**
     * The initial selected key in the collection (uncontrolled).
     * @deprecated
     */
    defaultSelectedKey?: Key | null;
    /**
     * Handler that is called when the selection changes.
     * @deprecated
     */
    onSelectionChange?: (key: Key | null) => void;
    /** The value of the ComboBox input (controlled). */
    inputValue?: string;
    /** The default value of the ComboBox input (uncontrolled). */
    defaultInputValue?: string;
    /** Handler that is called when the ComboBox input value changes. */
    onInputChange?: (value: string) => void;
    /** Whether the ComboBox allows a non-item matching input value to be set. */
    allowsCustomValue?: boolean;
    /**
     * The interaction required to display the ComboBox menu.
     * @default 'input'
     */
    menuTrigger?: MenuTriggerAction;
}
export interface ComboBoxState<T, M extends SelectionMode = 'sing